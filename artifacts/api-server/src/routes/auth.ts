// =============================================================================
// routes/auth.ts — Rotas de autenticação (registro, login, logout, "me").
// Cuida do hashing de senha, criação de usuário (+ perfil de aluno quando o
// papel é "student"), emissão do token Bearer e gravação do userId na sessão.
// =============================================================================
import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, studentProfilesTable, emailVerificationTokensTable } from "@workspace/db";
import {
  RegisterBody,
  LoginBody,
  VerifyEmailBody,
} from "@workspace/api-zod";
import { createHash, randomBytes } from "crypto";
import { sendEmail } from "../lib/email";
import { verificationEmail } from "../lib/emailTemplates";
import { getSessionUserId } from "../lib/authz";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Tokens de verificação de e-mail expiram em 48h.
const EMAIL_VERIFICATION_TTL_MS = 48 * 60 * 60 * 1000;

// URL pública do front, usada para montar o link de verificação no e-mail.
const PUBLIC_WEB_URL = process.env["PUBLIC_WEB_URL"] ?? "http://localhost:5173";

// Gera um token de verificação para o usuário, grava no banco e dispara o
// e-mail (fire-and-forget: falha de envio nunca derruba o registro/reenvio).
async function issueVerificationEmail(user: { id: number; name: string; email: string }): Promise<void> {
  const token = randomBytes(32).toString("hex");
  await db.insert(emailVerificationTokensTable).values({
    userId: user.id,
    token,
    expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
  });
  const verifyUrl = `${PUBLIC_WEB_URL}/verify-email?token=${token}`;
  const { subject, html } = verificationEmail({ name: user.name, verifyUrl });
  await sendEmail({ to: user.email, subject, html });
}

// Hash de senha com SHA-256 + salt fixo da aplicação. Determinístico: o mesmo
// cálculo é usado no login para comparar com o hash armazenado.
function hashPassword(password: string): string {
  return createHash("sha256").update(password + "academia_salt_2024").digest("hex");
}

// Monta a representação pública do usuário enviada ao cliente. Note que o
// passwordHash NUNCA é incluído; datas viram ISO string e campos opcionais
// são normalizados para null.
function serializeUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    unit: user.unit,
    emailVerified: user.emailVerified,
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

// POST /auth/register — cria um novo usuário e, se for aluno, seu perfil.
router.post("/auth/register", async (req, res): Promise<void> => {
  // Valida o corpo da requisição contra o schema zod compartilhado.
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name, email, password, role, unit, phone, birthDate, paymentDay, modalityThai, modalityJiu, bollacha, thaiGrade, thaiGradeColor, jiuGrade, jiuGradeColor, jiuDegree } = parsed.data;

  // Email é único: rejeita se já houver cadastro com este email.
  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing.length > 0) {
    res.status(400).json({ error: "Email already registered" });
    return;
  }

  // Insere o usuário base (a senha é gravada como hash; unidade default "matriz").
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

  // Apenas alunos têm perfil de treino. Cada campo de graduação/modalidade só é
  // gravado quando a modalidade correspondente está ativa (ex.: thaiGrade só faz
  // sentido se modalityThai for true), evitando dados inconsistentes.
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

  // Emite o token Bearer (base64 de "id:email:timestamp") e já autentica a
  // sessão para o usuário recém-criado. O cadastro NÃO fica bloqueado
  // esperando a confirmação do e-mail (soft-gate — ver EmailVerifyBanner no
  // front); se o envio falhar, o registro segue normalmente mesmo assim.
  const token = Buffer.from(`${user.id}:${user.email}:${Date.now()}`).toString("base64");

  (req.session as unknown as Record<string, unknown>).userId = user.id;
  (req.session as unknown as Record<string, unknown>).token = token;

  try {
    await issueVerificationEmail(user);
  } catch (err) {
    logger.error({ err, userId: user.id }, "Falha ao emitir e-mail de verificação no registro");
  }

  res.status(201).json({ user: serializeUser(user), token });
});

// POST /auth/login — valida credenciais e abre a sessão.
router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));

  // Mensagem genérica de erro (sem distinguir email inexistente de senha errada)
  // para não vazar quais emails existem. Compara o hash recalculado da senha.
  if (!user || user.passwordHash !== hashPassword(password)) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  // Credenciais ok: emite novo token e grava o userId na sessão.
  const token = Buffer.from(`${user.id}:${user.email}:${Date.now()}`).toString("base64");
  (req.session as unknown as Record<string, unknown>).userId = user.id;
  (req.session as unknown as Record<string, unknown>).token = token;

  res.json({ user: serializeUser(user), token });
});

// POST /auth/logout — destrói a sessão atual (cookie deixa de autenticar).
router.post("/auth/logout", async (req, res): Promise<void> => {
  req.session.destroy(() => {});
  res.json({ message: "Logged out successfully" });
});

// GET /auth/me — retorna o usuário autenticado a partir do userId da sessão.
// Serve para o front reidratar o estado de login ao recarregar.
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

// POST /auth/verify-email — confirma o e-mail a partir do token enviado no
// cadastro/reenvio. Token é de uso único: apagado após a verificação.
router.post("/auth/verify-email", async (req, res): Promise<void> => {
  const parsed = VerifyEmailBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [row] = await db
    .select()
    .from(emailVerificationTokensTable)
    .where(eq(emailVerificationTokensTable.token, parsed.data.token));

  if (!row || row.expiresAt.getTime() < Date.now()) {
    res.status(400).json({ error: "Link inválido ou expirado. Solicite um novo e-mail de confirmação." });
    return;
  }

  await db.update(usersTable).set({ emailVerified: true }).where(eq(usersTable.id, row.userId));
  // Remove todos os tokens do usuário (o usado e quaisquer outros pendentes).
  await db.delete(emailVerificationTokensTable).where(eq(emailVerificationTokensTable.userId, row.userId));

  res.json({ message: "E-mail confirmado com sucesso!" });
});

// POST /auth/resend-verification — reenvia o e-mail de confirmação para o
// usuário autenticado (self). Invalida tokens antigos antes de gerar um novo.
router.post("/auth/resend-verification", async (req, res): Promise<void> => {
  const userId = getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  if (user.emailVerified) {
    res.json({ message: "E-mail já confirmado." });
    return;
  }

  await db.delete(emailVerificationTokensTable).where(eq(emailVerificationTokensTable.userId, user.id));
  await issueVerificationEmail(user);

  res.json({ message: "E-mail de confirmação reenviado." });
});

export default router;
