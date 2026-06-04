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

router.get("/users", async (req, res): Promise<void> => {
  const query = ListUsersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  let dbQuery = db.select().from(usersTable).$dynamic();

  if (query.data.role) {
    dbQuery = dbQuery.where(eq(usersTable.role, query.data.role as "student" | "teacher" | "admin"));
  }

  if (query.data.search) {
    const search = `%${query.data.search}%`;
    dbQuery = dbQuery.where(or(ilike(usersTable.name, search), ilike(usersTable.email, search)));
  }

  const users = await dbQuery;
  res.json(users.map(serializeUser));
});

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

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(serializeUser(user));
});

router.delete("/users/:id", async (req, res): Promise<void> => {
  const params = DeleteUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [user] = await db.delete(usersTable).where(eq(usersTable.id, params.data.id)).returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({ message: "User deleted successfully" });
});

export default router;
