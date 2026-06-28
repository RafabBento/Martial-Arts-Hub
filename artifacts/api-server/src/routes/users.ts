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

const router: IRouter = Router();

// Representação pública do usuário (sem passwordHash); datas em ISO e opcionais
// normalizados para null. Mesma forma usada nas rotas de auth.
function serializeUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    unit: user.unit,
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
router.get("/users", async (req, res): Promise<void> => {
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
  res.json(users.map(serializeUser));
});

// GET /users/:id — obtém um único usuário pelo id.
router.get("/users/:id", async (req, res): Promise<void> => {
  const params = GetUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(serializeUser(user));
});

// PATCH /users/:id — atualização parcial dos dados de um usuário.
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

  // Drizzle .set() accepts undefined (omit) but not null for enum cols, so
  // extract unit and only spread it when it has a real value.
  // (Tradução: colunas enum não aceitam null no .set(); por isso separamos
  // "unit" e só o incluímos no update quando tem valor real.)
  const { unit: unitVal, ...restBody } = body.data;
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

  res.json(serializeUser(user));
});

// DELETE /users/:id — remove um usuário pelo id.
router.delete("/users/:id", async (req, res): Promise<void> => {
  const params = DeleteUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
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
