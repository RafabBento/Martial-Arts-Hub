import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, studentProfilesTable } from "@workspace/db";
import {
  RegisterBody,
  LoginBody,
} from "@workspace/api-zod";
import { createHash } from "crypto";

const router: IRouter = Router();

function hashPassword(password: string): string {
  return createHash("sha256").update(password + "academia_salt_2024").digest("hex");
}

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
    createdAt: user.createdAt.toISOString(),
  };
}

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name, email, password, role, unit, phone, birthDate, paymentDay, modalityThai, modalityJiu, bollacha, thaiGrade, thaiGradeColor, jiuGrade, jiuGradeColor, jiuDegree } = parsed.data;

  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing.length > 0) {
    res.status(400).json({ error: "Email already registered" });
    return;
  }

  const [user] = await db.insert(usersTable).values({
    name,
    email,
    passwordHash: hashPassword(password),
    role: role as "student" | "teacher" | "admin",
    unit: (unit ?? "matriz") as "matriz" | "panobianco" | "upfitness",
    phone,
    birthDate: birthDate ?? null,
    paymentDay: paymentDay ?? null,
    modalityThai: modalityThai ?? null,
    modalityJiu: modalityJiu ?? null,
  }).returning();

  if (role === "student") {
    await db.insert(studentProfilesTable).values({
      userId: user.id,
      modalityThai: modalityThai ?? false,
      modalityJiu: modalityJiu ?? false,
      bollacha: (modalityJiu && bollacha) ? true : false,
      thaiGrade: (modalityThai && thaiGrade) ? thaiGrade : null,
      thaiGradeColor: (modalityThai && thaiGradeColor) ? thaiGradeColor : null,
      jiuGrade: (modalityJiu && jiuGrade) ? jiuGrade : null,
      jiuGradeColor: (modalityJiu && jiuGradeColor) ? jiuGradeColor : null,
      jiuDegree: (modalityJiu && jiuDegree != null) ? jiuDegree : null,
    });
  }

  const token = Buffer.from(`${user.id}:${user.email}:${Date.now()}`).toString("base64");

  (req.session as unknown as Record<string, unknown>).userId = user.id;
  (req.session as unknown as Record<string, unknown>).token = token;

  res.status(201).json({ user: serializeUser(user), token });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));

  if (!user || user.passwordHash !== hashPassword(password)) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const token = Buffer.from(`${user.id}:${user.email}:${Date.now()}`).toString("base64");
  (req.session as unknown as Record<string, unknown>).userId = user.id;
  (req.session as unknown as Record<string, unknown>).token = token;

  res.json({ user: serializeUser(user), token });
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  req.session.destroy(() => {});
  res.json({ message: "Logged out successfully" });
});

router.get("/auth/me", async (req, res): Promise<void> => {
  const userId = (req.session as unknown as Record<string, unknown>).userId as number | undefined;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  res.json(serializeUser(user));
});

export default router;
