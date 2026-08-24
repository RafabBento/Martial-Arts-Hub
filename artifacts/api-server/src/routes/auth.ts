// =============================================================================
// routes/auth.ts — Rotas de autenticação (registro, login, logout, "me").
// Cuida do hashing de senha, criação de usuário (+ perfil de aluno quando o
// papel é "student"), emissão do token Bearer e gravação do userId na sessão.
// =============================================================================
import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, studentProfilesTable, emailVerificationTokensTable, passwordResetTokensTable, healthDeclarationsTable } from "@workspace/db";
import {
  RegisterBody,
  LoginBody,
  VerifyEmailBody,
  ForgotPasswordBody,
  ResetPasswordBody,
  CompleteProfileBody,
} from "@workspace/api-zod";
import { createHash, randomBytes } from "crypto";
import { sendEmail } from "../lib/email";
import { verificationEmail, passwordResetEmail, healthDeclarationEmail } from "../lib/emailTemplates";
import { getSessionUserId, getUserGateFlags, hasFaceRegistered } from "../lib/authz";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Tokens de verificação de e-mail expiram em 48h.
const EMAIL_VERIFICATION_TTL_MS = 48 * 60 * 60 * 1000;

// Tokens de redefinição de senha expiram em 1h (janela mais curta — trocar de
// senha é mais sensível que confirmar cadastro).
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

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

// Normaliza telefone para comparação (mantém só dígitos) — evita que
// formatação diferente ("(11) 99999-0000" vs "11999990000") escape da
// checagem de "não pode ser o mesmo telefone do próprio usuário".
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

// Calcula se a pessoa é menor de idade (<18) a partir da data de nascimento
// (YYYY-MM-DD), na data atual do cadastro.
function calculateIsMinor(birthDate: string): boolean {
  const birth = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age--;
  }
  return age < 18;
}

// Validação compartilhada do termo de saúde/responsabilidade, usada tanto no
// cadastro (POST /auth/register) quanto no preenchimento retroativo
// (POST /auth/complete-profile). Retorna o erro a exibir, ou isMinor quando
// tudo está válido.
function validateHealthFields(input: {
  phone: string;
  birthDate: string;
  emergencyContactPhone: string;
  declarationAccepted: boolean;
  guardianName?: string | null;
  guardianPhone?: string | null;
}): { error: string } | { isMinor: boolean } {
  if (!input.declarationAccepted) {
    return { error: "É necessário aceitar a declaração final para continuar." };
  }

  // O contato de emergência precisa ser uma pessoa diferente do próprio usuário.
  if (normalizePhone(input.emergencyContactPhone) === normalizePhone(input.phone)) {
    return { error: "O contato de emergência não pode ter o mesmo telefone do próprio usuário." };
  }

  const isMinor = calculateIsMinor(input.birthDate);

  // Menores de idade precisam informar os dados do responsável, além do
  // contato de emergência (que continua sendo uma pessoa à parte).
  if (isMinor) {
    if (!input.guardianName?.trim() || !input.guardianPhone?.trim()) {
      return { error: "Para menores de idade, é necessário informar o nome e telefone do responsável." };
    }
    if (normalizePhone(input.guardianPhone) === normalizePhone(input.phone)) {
      return { error: "O telefone do responsável não pode ser o mesmo telefone do usuário." };
    }
    if (normalizePhone(input.guardianPhone) === normalizePhone(input.emergencyContactPhone)) {
      return { error: "O telefone do responsável não pode ser o mesmo do contato de emergência." };
    }
  }

  return { isMinor };
}

// Monta a representação pública do usuário enviada ao cliente. Note que o
// passwordHash NUNCA é incluído; datas viram ISO string e campos opcionais
// são normalizados para null. profileComplete/faceRegistered precisam ser
// calculados à parte (consultas a health_declarations/student_profiles) e
// passados explicitamente por quem chama.
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

// POST /auth/register — cria um novo usuário e, se for aluno, seu perfil.
router.post("/auth/register", async (req, res): Promise<void> => {
  // Valida o corpo da requisição contra o schema zod compartilhado.
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const {
    name, email, password, role, unit, phone, birthDate, paymentDay, modalityThai, modalityJiu, bollacha,
    thaiGrade, thaiGradeColor, jiuGrade, jiuGradeColor, jiuDegree,
    hasInjury, injuryDetails, hasCondition, conditionDetails, takesMedication, medicationDetails,
    emergencyContactName, emergencyContactPhone, imageConsent, guardianName, guardianPhone, declarationAccepted,
  } = parsed.data;

  const validation = validateHealthFields({ phone, birthDate, emergencyContactPhone, declarationAccepted, guardianName, guardianPhone });
  if ("error" in validation) {
    res.status(400).json({ error: validation.error });
    return;
  }
  const { isMinor } = validation;

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

  // Termo de saúde e responsabilidade — aplicado a todos os papéis (aluno e
  // professor), não só alunos.
  await db.insert(healthDeclarationsTable).values({
    userId: user.id,
    hasInjury: hasInjury ?? false,
    injuryDetails: (hasInjury && injuryDetails) ? injuryDetails : null,
    hasCondition: hasCondition ?? false,
    conditionDetails: (hasCondition && conditionDetails) ? conditionDetails : null,
    takesMedication: takesMedication ?? false,
    medicationDetails: (takesMedication && medicationDetails) ? medicationDetails : null,
    emergencyContactName,
    emergencyContactPhone,
    imageConsent: imageConsent ?? false,
    isMinor,
    guardianName: isMinor ? (guardianName ?? null) : null,
    guardianPhone: isMinor ? (guardianPhone ?? null) : null,
  });

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

  // E-mail extra, separado do de confirmação de cadastro, com uma cópia do
  // termo de saúde preenchido.
  try {
    const { subject, html } = healthDeclarationEmail({
      name: user.name,
      isMinor,
      hasInjury: hasInjury ?? false,
      injuryDetails: (hasInjury && injuryDetails) ? injuryDetails : null,
      hasCondition: hasCondition ?? false,
      conditionDetails: (hasCondition && conditionDetails) ? conditionDetails : null,
      takesMedication: takesMedication ?? false,
      medicationDetails: (takesMedication && medicationDetails) ? medicationDetails : null,
      emergencyContactName,
      emergencyContactPhone,
      imageConsent: imageConsent ?? false,
      guardianName: isMinor ? (guardianName ?? null) : null,
      guardianPhone: isMinor ? (guardianPhone ?? null) : null,
    });
    await sendEmail({ to: user.email, subject, html });
  } catch (err) {
    logger.error({ err, userId: user.id }, "Falha ao emitir e-mail de confirmação do termo de saúde");
  }

  // Acabamos de gravar o termo de saúde nesta mesma requisição: já sabemos
  // que o perfil está completo. O rosto ainda não foi cadastrado — isso é
  // feito depois, no gate de navegação (obrigatório para liberar o app).
  res.status(201).json({ user: serializeUser(user, true, false), token });
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

  const loginFlags = await getUserGateFlags(user.id);
  res.json({ user: serializeUser(user, loginFlags.profileComplete, loginFlags.faceRegistered), token });
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

  const meFlags = await getUserGateFlags(user.id);
  res.json(serializeUser(user, meFlags.profileComplete, meFlags.faceRegistered));
});

// POST /auth/complete-profile — preenche retroativamente o termo de saúde e
// responsabilidade (e telefone/data de nascimento, se ainda vazios) para
// contas criadas antes desse questionário existir. Self only. Depois disso,
// profileComplete vira true e o gate de navegação libera o app.
router.post("/auth/complete-profile", async (req, res): Promise<void> => {
  const userId = getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const parsed = CompleteProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const {
    phone, birthDate, hasInjury, injuryDetails, hasCondition, conditionDetails,
    takesMedication, medicationDetails, emergencyContactName, emergencyContactPhone,
    imageConsent, guardianName, guardianPhone, declarationAccepted,
  } = parsed.data;

  const validation = validateHealthFields({ phone, birthDate, emergencyContactPhone, declarationAccepted, guardianName, guardianPhone });
  if ("error" in validation) {
    res.status(400).json({ error: validation.error });
    return;
  }
  const { isMinor } = validation;

  const [existingUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!existingUser) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const [user] = await db.update(usersTable).set({ phone, birthDate }).where(eq(usersTable.id, userId)).returning();

  const healthValues = {
    hasInjury: hasInjury ?? false,
    injuryDetails: (hasInjury && injuryDetails) ? injuryDetails : null,
    hasCondition: hasCondition ?? false,
    conditionDetails: (hasCondition && conditionDetails) ? conditionDetails : null,
    takesMedication: takesMedication ?? false,
    medicationDetails: (takesMedication && medicationDetails) ? medicationDetails : null,
    emergencyContactName,
    emergencyContactPhone,
    imageConsent: imageConsent ?? false,
    isMinor,
    guardianName: isMinor ? (guardianName ?? null) : null,
    guardianPhone: isMinor ? (guardianPhone ?? null) : null,
  };

  // Upsert: normalmente é a primeira vez (conta antiga sem termo), mas um
  // reenvio acidental não deve quebrar com erro de chave duplicada.
  await db
    .insert(healthDeclarationsTable)
    .values({ userId, ...healthValues })
    .onConflictDoUpdate({ target: healthDeclarationsTable.userId, set: healthValues });

  // E-mail extra de confirmação do termo, mesmo template usado no cadastro.
  try {
    const { subject, html } = healthDeclarationEmail({
      name: user.name,
      isMinor,
      hasInjury: healthValues.hasInjury,
      injuryDetails: healthValues.injuryDetails,
      hasCondition: healthValues.hasCondition,
      conditionDetails: healthValues.conditionDetails,
      takesMedication: healthValues.takesMedication,
      medicationDetails: healthValues.medicationDetails,
      emergencyContactName,
      emergencyContactPhone,
      imageConsent: healthValues.imageConsent,
      guardianName: healthValues.guardianName,
      guardianPhone: healthValues.guardianPhone,
    });
    await sendEmail({ to: user.email, subject, html });
  } catch (err) {
    logger.error({ err, userId }, "Falha ao emitir e-mail de confirmação do termo de saúde (complete-profile)");
  }

  res.json(serializeUser(user, true, await hasFaceRegistered(userId)));
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

// POST /auth/forgot-password — envia um e-mail com link de redefinição de
// senha, se o e-mail informado tiver conta. Resposta é sempre a mesma
// mensagem genérica (exista o e-mail ou não) para não vazar quais e-mails
// estão cadastrados.
router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const parsed = ForgotPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, parsed.data.email));
  if (user) {
    try {
      const token = randomBytes(32).toString("hex");
      // Invalida qualquer token de redefinição pendente antes de gerar um novo.
      await db.delete(passwordResetTokensTable).where(eq(passwordResetTokensTable.userId, user.id));
      await db.insert(passwordResetTokensTable).values({
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      });
      const resetUrl = `${PUBLIC_WEB_URL}/reset-password?token=${token}`;
      const { subject, html } = passwordResetEmail({ name: user.name, resetUrl });
      await sendEmail({ to: user.email, subject, html });
    } catch (err) {
      logger.error({ err, userId: user.id }, "Falha ao emitir e-mail de redefinição de senha");
    }
  }

  res.json({ message: "Se este e-mail estiver cadastrado, enviamos um link de redefinição de senha." });
});

// POST /auth/reset-password — define uma nova senha a partir do token
// enviado por /auth/forgot-password. Token de uso único.
router.post("/auth/reset-password", async (req, res): Promise<void> => {
  const parsed = ResetPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [row] = await db
    .select()
    .from(passwordResetTokensTable)
    .where(eq(passwordResetTokensTable.token, parsed.data.token));

  if (!row || row.expiresAt.getTime() < Date.now()) {
    res.status(400).json({ error: "Link inválido ou expirado. Solicite uma nova redefinição de senha." });
    return;
  }

  await db.update(usersTable).set({ passwordHash: hashPassword(parsed.data.password) }).where(eq(usersTable.id, row.userId));
  // Remove todos os tokens do usuário (o usado e quaisquer outros pendentes).
  await db.delete(passwordResetTokensTable).where(eq(passwordResetTokensTable.userId, row.userId));

  res.json({ message: "Senha redefinida com sucesso!" });
});

export default router;
