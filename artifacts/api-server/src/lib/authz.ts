// =============================================================================
// lib/authz.ts — Helpers de autenticação/autorização compartilhados entre rotas.
// Extraído do padrão que já existia (duplicado) em routes/face.ts. Cada rota
// continua decidindo sozinha SE e COMO aplicar a checagem (self, master-only,
// etc.) — este módulo só centraliza a leitura da sessão e a busca do requester.
// =============================================================================
import { eq, inArray, isNotNull, and } from "drizzle-orm";
import { db, usersTable, healthDeclarationsTable, studentProfilesTable, studentFaceDescriptorsTable } from "@workspace/db";

// Lê o id do usuário autenticado a partir da sessão (cookie ou Bearer, já
// populada por bearerAuth). Ausente = não autenticado.
export function getSessionUserId(req: { session: unknown }): number | undefined {
  return (req.session as Record<string, unknown>).userId as number | undefined;
}

// Busca o solicitante (id + role + unit) no banco; usado para checagens de
// autorização (self-access, master-only, isenção por unidade).
export async function getRequester(
  userId: number | undefined,
): Promise<{ id: number; role: string; unit: string } | null> {
  if (!userId) return null;
  const [user] = await db
    .select({ id: usersTable.id, role: usersTable.role, unit: usersTable.unit })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  return user ?? null;
}

// "Mestre" = professor ou admin — mesma definição usada em todo o front (isMaster).
export function isMasterRole(role: string): boolean {
  return role === "teacher" || role === "admin";
}

// Indica se o usuário já preencheu o termo de saúde e responsabilidade — usado
// para computar "profileComplete" no User serializado e no gate de navegação
// (contas criadas antes desse termo existir precisam preenchê-lo antes de usar
// o app). Uma única linha por usuário (FK única em health_declarations.user_id).
export async function hasHealthDeclaration(userId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: healthDeclarationsTable.id })
    .from(healthDeclarationsTable)
    .where(eq(healthDeclarationsTable.userId, userId));
  return !!row;
}

// Versão em lote de hasHealthDeclaration, para não disparar N queries ao
// serializar uma listagem de usuários.
export async function getHealthDeclarationUserIds(userIds: number[]): Promise<Set<number>> {
  if (userIds.length === 0) return new Set();
  const rows = await db
    .select({ userId: healthDeclarationsTable.userId })
    .from(healthDeclarationsTable)
    .where(inArray(healthDeclarationsTable.userId, userIds));
  return new Set(rows.map(r => r.userId));
}

// Indica se o usuário já tem um rosto de referência cadastrado (qualquer
// papel — student_profiles é criada automaticamente na primeira vez que
// professor/admin também cadastram o rosto, ver routes/face.ts). Usado para
// computar "faceRegistered" no User serializado e no gate de navegação
// (reconhecimento facial é obrigatório para todos: sem rosto cadastrado, não
// entra no app).
//
// Existem duas fontes: o campo legado studentProfilesTable.faceDescriptor
// (1 descritor, preenchido por POST /face/profile-photo) e a tabela
// student_face_descriptors (N ângulos, preenchida por POST /face/enroll —
// o fluxo de cadastro obrigatório de fato usado pelos usuários). É preciso
// checar as duas: checar só a primeira fazia o gate considerar "não
// cadastrado" quem só passou pelo /face/enroll, pedindo o cadastro de novo
// a cada login.
export async function hasFaceRegistered(userId: number): Promise<boolean> {
  const [profileRows, descriptorRows] = await Promise.all([
    db
      .select({ id: studentProfilesTable.id })
      .from(studentProfilesTable)
      .where(and(eq(studentProfilesTable.userId, userId), isNotNull(studentProfilesTable.faceDescriptor))),
    db
      .select({ id: studentFaceDescriptorsTable.id })
      .from(studentFaceDescriptorsTable)
      .where(eq(studentFaceDescriptorsTable.userId, userId)),
  ]);
  return profileRows.length > 0 || descriptorRows.length > 0;
}

// Versão em lote de hasFaceRegistered, mesmo motivo de getHealthDeclarationUserIds.
export async function getFaceRegisteredUserIds(userIds: number[]): Promise<Set<number>> {
  if (userIds.length === 0) return new Set();
  const [profileRows, descriptorRows] = await Promise.all([
    db
      .select({ userId: studentProfilesTable.userId })
      .from(studentProfilesTable)
      .where(and(inArray(studentProfilesTable.userId, userIds), isNotNull(studentProfilesTable.faceDescriptor))),
    db
      .select({ userId: studentFaceDescriptorsTable.userId })
      .from(studentFaceDescriptorsTable)
      .where(inArray(studentFaceDescriptorsTable.userId, userIds)),
  ]);
  return new Set([...profileRows.map(r => r.userId), ...descriptorRows.map(r => r.userId)]);
}

// Calcula os dois flags de gate de navegação de uma vez (evita duas consultas
// sequenciais espalhadas pelas rotas de auth/users).
export async function getUserGateFlags(userId: number): Promise<{ profileComplete: boolean; faceRegistered: boolean }> {
  const [profileComplete, faceRegistered] = await Promise.all([
    hasHealthDeclaration(userId),
    hasFaceRegistered(userId),
  ]);
  return { profileComplete, faceRegistered };
}

// Campos de graduação: só professor/admin pode alterá-los. Mesmos nomes em
// usersTable e studentProfilesTable — compartilhado entre routes/users.ts e
// routes/students.ts.
export const GRADE_FIELDS = ["thaiGrade", "thaiGradeColor", "jiuGrade", "jiuGradeColor", "jiuDegree"] as const;

// Remove do objeto de update os campos presentes em `fields` — usado para
// impedir que um aluno altere, via self-edit, campos reservados a mestres
// (graduação, bolsista).
export function stripFields<T extends Record<string, unknown>>(data: T, fields: readonly string[]): Partial<T> {
  return Object.fromEntries(Object.entries(data).filter(([k]) => !fields.includes(k))) as Partial<T>;
}
