// =============================================================================
// routes/users.ts — CRUD de usuários (listar, obter, atualizar, remover).
// Operações administrativas sobre a tabela de usuários, usadas pelas telas de
// gestão. Cada rota valida params/body com schemas zod compartilhados.
// =============================================================================
import { Router, type IRouter } from "express";
import { eq, ilike, or } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import {
  ListUsersQueryParams,
  GetUserParams,
  UpdateUserParams,
  UpdateUserBody,
  DeleteUserParams,
} from "@workspace/api-zod";
import {
  getSessionUserId, getRequester, isMasterRole, GRADE_FIELDS, stripFields,
  getUserGateFlags, getHealthDeclarationUserIds, getFaceRegisteredUserIds,
} from "../lib/authz";

const router: IRouter = Router();

// Representação pública do usuário (sem passwordHash); datas em ISO e opcionais
// normalizados para null. Mesma forma usada nas rotas de auth.
// profileComplete/faceRegistered precisam ser calculados à parte — importante
// manter aqui igual ao de auth.ts, porque Profile.tsx faz setUser(response)
// direto com o retorno de PATCH /users/:id.
function serializeUser(user: typeof usersTable.$inferSelect, profileComplete: boolean, faceRegistered: boolean) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    unit: user.unit,
    emailVerified: user.emailVerified,
    profileComplete,
    faceRegistered,
    phone: user.phone ?? null,
    profilePhotoUrl: user.profilePhotoUrl ?? null,
    birthDate: user.birthDate ?? null,
    paymentDay: user.paymentDay ?? null,
    modalityThai: user.modalityThai ?? null,
    modalityJiu: user.modalityJiu ?? null,
    thaiGrade: user.thaiGrade ?? null,
    thaiGradeColor: user.thaiGradeColor ?? null,
    jiuGrade: user.jiuGrade ?? null,
    jiuGradeColor: user.jiuGradeColor ?? null,
    jiuDegree: user.jiuDegree ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

// GET /users — lista usuários com filtros opcionais por papel e busca textual.
// Master-only: a listagem completa não é necessária para nenhum fluxo de aluno.
router.get("/users", async (req, res): Promise<void> => {
  const requester = await getRequester(getSessionUserId(req));
  if (!requester) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  if (!isMasterRole(requester.role)) {
    res.status(403).json({ error: "Acesso restrito a professores e administradores" });
    return;
  }

  const query = ListUsersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  // Query dinâmica: começa sem filtros e vai acumulando os WHERE conforme os
  // parâmetros presentes.
  let dbQuery = db.select().from(usersTable).$dynamic();

  // Filtro por papel (student/teacher/admin) quando informado.
  if (query.data.role) {
    dbQuery = dbQuery.where(eq(usersTable.role, query.data.role as "student" | "teacher" | "admin"));
  }

  // Busca case-insensitive (ilike) por nome OU email usando curingas.
  if (query.data.search) {
    const search = `%${query.data.search}%`;
    dbQuery = dbQuery.where(or(ilike(usersTable.name, search), ilike(usersTable.email, search)));
  }

  const users = await dbQuery;
  // Uma única consulta em lote em vez de N por flag (ver get*UserIds em authz.ts).
  const ids = users.map(u => u.id);
  const [withDeclaration, withFace] = await Promise.all([
    getHealthDeclarationUserIds(ids),
    getFaceRegisteredUserIds(ids),
  ]);
  res.json(users.map(u => serializeUser(u, withDeclaration.has(u.id), withFace.has(u.id))));
});

// GET /users/:id — obtém um único usuário pelo id. Self ou master.
router.get("/users/:id", async (req, res): Promise<void> => {
  const params = GetUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const requester = await getRequester(getSessionUserId(req));
  if (!requester) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  if (!isMasterRole(requester.role) && requester.id !== params.data.id) {
    res.status(403).json({ error: "Você só pode ver os próprios dados" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const getFlags = await getUserGateFlags(user.id);
  res.json(serializeUser(user, getFlags.profileComplete, getFlags.faceRegistered));
});

// PATCH /users/:id — atualização parcial dos dados de um usuário. Self ou
// master; self-edit de aluno não pode alterar campos de graduação (só quem
// gradua é professor/admin — mesma regra de routes/students.ts).
router.patch("/users/:id", async (req, res): Promise<void> => {
  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = UpdateUserBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const requester = await getRequester(getSessionUserId(req));
  if (!requester) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  const isMaster = isMasterRole(requester.role);
  if (!isMaster && requester.id !== params.data.id) {
    res.status(403).json({ error: "Você só pode editar os próprios dados" });
    return;
  }
  // Self-edit de aluno: bloqueia campos de graduação. "role" é bloqueado para
  // qualquer edição não-master (só um mestre pode promover/rebaixar alguém).
  const bodyData = !isMaster
    ? stripFields(body.data, requester.role === "student" ? [...GRADE_FIELDS, "role"] : ["role"])
    : body.data;

  // Drizzle .set() accepts undefined (omit) but not null for enum cols, so
  // extract unit and only spread it when it has a real value.
  // (Tradução: colunas enum não aceitam null no .set(); por isso separamos
  // "unit" e só o incluímos no update quando tem valor real.)
  const { unit: unitVal, ...restBody } = bodyData;
  const updateData = {
    ...restBody,
    ...(unitVal != null ? { unit: unitVal } : {}),
  };

  const [user] = await db
    .update(usersTable)
    .set(updateData)
    .where(eq(usersTable.id, params.data.id))
    .returning();

  // .returning() vazio significa que nenhum id casou → usuário não existe.
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const patchFlags = await getUserGateFlags(user.id);
  res.json(serializeUser(user, patchFlags.profileComplete, patchFlags.faceRegistered));
});

// DELETE /users/:id — remove um usuário pelo id. Master-only.
router.delete("/users/:id", async (req, res): Promise<void> => {
  const params = DeleteUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const requester = await getRequester(getSessionUserId(req));
  if (!requester) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  if (!isMasterRole(requester.role)) {
    res.status(403).json({ error: "Acesso restrito a professores e administradores" });
    return;
  }

  // Se nada foi retornado, o usuário não existia → 404.
  const [user] = await db.delete(usersTable).where(eq(usersTable.id, params.data.id)).returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({ message: "User deleted successfully" });
});

export default router;
