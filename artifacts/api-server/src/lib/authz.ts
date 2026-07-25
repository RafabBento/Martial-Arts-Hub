// =============================================================================
// lib/authz.ts — Helpers de autenticação/autorização compartilhados entre rotas.
// Extraído do padrão que já existia (duplicado) em routes/face.ts. Cada rota
// continua decidindo sozinha SE e COMO aplicar a checagem (self, master-only,
// etc.) — este módulo só centraliza a leitura da sessão e a busca do requester.
// =============================================================================
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

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
