// =============================================================================
// routes/students.ts — Rotas de alunos (listar, obter, atualizar perfil).
// Junta usersTable + studentProfilesTable e agrega contagem de presenças por
// modalidade. Regras de negócio importantes: alunos só enxergam a própria
// unidade; sábado de Muay Thai conta em dobro; alunos não podem alterar
// graduações (campos de grade são removidos do update quando o requester é aluno).
// =============================================================================
import { Router, type IRouter } from "express";
import { eq, and, ilike, or } from "drizzle-orm";
import { db, usersTable, studentProfilesTable, attendanceTable, trainingSessionsTable } from "@workspace/db";
import {
  ListStudentsQueryParams,
  GetStudentParams,
  UpdateStudentParams,
  UpdateStudentBody,
} from "@workspace/api-zod";
import { sql } from "drizzle-orm";

// Unidades (filiais) válidas da academia.
type Unit = "matriz" | "panobianco" | "upfitness";

const router: IRouter = Router();

// GET /students — lista alunos com filtros por modalidade/unidade/busca e
// presenças agregadas por modalidade.
router.get("/students", async (req, res): Promise<void> => {
  const query = ListStudentsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  // Descobre o papel/unidade de quem está pedindo — alunos só veem a própria
  // unidade (regra de autorização aplicada mais abaixo nas conditions).
  const requesterId = (req.session as unknown as Record<string, unknown>).userId as number | undefined;
  let requesterUnit: Unit | null = null;
  let requesterRole: string | null = null;
  if (requesterId) {
    const [requester] = await db.select({ role: usersTable.role, unit: usersTable.unit }).from(usersTable).where(eq(usersTable.id, requesterId));
    requesterRole = requester?.role ?? null;
    requesterUnit = (requester?.unit ?? null) as Unit | null;
  }

  // Filtros acumulados do WHERE. Base: só usuários com papel "student".
  let conditions: ReturnType<typeof eq>[] = [eq(usersTable.role, "student")];

  // Filtro por modalidade: thai, jiu ou "both" (precisa treinar ambas).
  if (query.data.modality === "thai") {
    conditions.push(eq(studentProfilesTable.modalityThai, true));
  } else if (query.data.modality === "jiu") {
    conditions.push(eq(studentProfilesTable.modalityJiu, true));
  } else if (query.data.modality === "both") {
    conditions.push(eq(studentProfilesTable.modalityThai, true));
    conditions.push(eq(studentProfilesTable.modalityJiu, true));
  }

  // Students auto-filtered to their unit; teachers/admins use optional query param
  if (requesterRole === "student" && requesterUnit) {
    conditions.push(eq(usersTable.unit, requesterUnit));
  } else if (query.data.unit) {
    conditions.push(eq(usersTable.unit, query.data.unit as Unit));
  }

  // Junta usuário + perfil de aluno e seleciona os campos expostos na listagem.
  let joinQuery = db
    .select({
      id: studentProfilesTable.id,
      userId: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      unit: usersTable.unit,
      profilePhotoUrl: usersTable.profilePhotoUrl,
      modalityThai: studentProfilesTable.modalityThai,
      modalityJiu: studentProfilesTable.modalityJiu,
      bollacha: studentProfilesTable.bollacha,
      thaiGrade: studentProfilesTable.thaiGrade,
      jiuGrade: studentProfilesTable.jiuGrade,
      jiuDegree: studentProfilesTable.jiuDegree,
      thaiGradeColor: studentProfilesTable.thaiGradeColor,
      jiuGradeColor: studentProfilesTable.jiuGradeColor,
      faceDescriptor: studentProfilesTable.faceDescriptor,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .innerJoin(studentProfilesTable, eq(usersTable.id, studentProfilesTable.userId))
    .where(and(...conditions))
    .$dynamic();

  // Busca textual opcional por nome ou email (case-insensitive).
  if (query.data.search) {
    const search = `%${query.data.search}%`;
    joinQuery = joinQuery.where(or(ilike(usersTable.name, search), ilike(usersTable.email, search)));
  }

  const students = await joinQuery;

  // Presenças de Muay Thai agregadas por aluno. Regra: sessões de sábado
  // (EXTRACT(DOW)=6) contam em dobro; nas demais, conta 1.
  const thaiAttendance = await db
    .select({
      studentId: attendanceTable.studentId,
      count: sql<number>`SUM(CASE WHEN EXTRACT(DOW FROM ${trainingSessionsTable.sessionDate}) = 6 THEN 2 ELSE 1 END)::int`,
    })
    .from(attendanceTable)
    .innerJoin(trainingSessionsTable, eq(attendanceTable.sessionId, trainingSessionsTable.id))
    .where(eq(trainingSessionsTable.modality, "thai"))
    .groupBy(attendanceTable.studentId);

  // Presenças de Jiu-Jitsu: contagem simples (sem peso de sábado).
  const jiuAttendance = await db
    .select({
      studentId: attendanceTable.studentId,
      count: sql<number>`count(*)::int`,
    })
    .from(attendanceTable)
    .innerJoin(trainingSessionsTable, eq(attendanceTable.sessionId, trainingSessionsTable.id))
    .where(eq(trainingSessionsTable.modality, "jiu"))
    .groupBy(attendanceTable.studentId);

  // Indexa as contagens por userId para lookup O(1) ao montar a resposta.
  const thaiMap = new Map(thaiAttendance.map(a => [a.studentId, a.count]));
  const jiuMap = new Map(jiuAttendance.map(a => [a.studentId, a.count]));

  // Serializa cada aluno; hasFaceDescriptor indica se já há rosto de referência
  // cadastrado (sem expor o descritor em si).
  res.json(students.map(s => ({
    id: s.id,
    userId: s.userId,
    name: s.name,
    email: s.email,
    unit: s.unit,
    profilePhotoUrl: s.profilePhotoUrl ?? null,
    modalityThai: s.modalityThai,
    modalityJiu: s.modalityJiu,
    bollacha: s.bollacha,
    thaiGrade: s.thaiGrade ?? null,
    jiuGrade: s.jiuGrade ?? null,
    jiuDegree: s.jiuDegree ?? null,
    thaiGradeColor: s.thaiGradeColor ?? null,
    jiuGradeColor: s.jiuGradeColor ?? null,
    hasFaceDescriptor: s.faceDescriptor !== null,
    totalAttendanceThai: thaiMap.get(s.userId) ?? 0,
    totalAttendanceJiu: jiuMap.get(s.userId) ?? 0,
    createdAt: s.createdAt.toISOString(),
  })));
});

// GET /students/:id — detalhe de um aluno com suas contagens de presença.
router.get("/students/:id", async (req, res): Promise<void> => {
  const params = GetStudentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Busca o aluno (usuário + perfil) pelo id do usuário.
  const [student] = await db
    .select({
      id: studentProfilesTable.id,
      userId: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      unit: usersTable.unit,
      profilePhotoUrl: usersTable.profilePhotoUrl,
      modalityThai: studentProfilesTable.modalityThai,
      modalityJiu: studentProfilesTable.modalityJiu,
      bollacha: studentProfilesTable.bollacha,
      thaiGrade: studentProfilesTable.thaiGrade,
      jiuGrade: studentProfilesTable.jiuGrade,
      jiuDegree: studentProfilesTable.jiuDegree,
      thaiGradeColor: studentProfilesTable.thaiGradeColor,
      jiuGradeColor: studentProfilesTable.jiuGradeColor,
      faceDescriptor: studentProfilesTable.faceDescriptor,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .innerJoin(studentProfilesTable, eq(usersTable.id, studentProfilesTable.userId))
    .where(eq(usersTable.id, params.data.id));

  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }

  // Total de Muay Thai do aluno — sábado conta em dobro (mesma regra da lista).
  const thaiCount = await db
    .select({
      count: sql<number>`SUM(CASE WHEN EXTRACT(DOW FROM ${trainingSessionsTable.sessionDate}) = 6 THEN 2 ELSE 1 END)::int`,
    })
    .from(attendanceTable)
    .innerJoin(trainingSessionsTable, eq(attendanceTable.sessionId, trainingSessionsTable.id))
    .where(and(eq(attendanceTable.studentId, student.userId), eq(trainingSessionsTable.modality, "thai")));

  // Total de Jiu-Jitsu do aluno — contagem simples.
  const jiuCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(attendanceTable)
    .innerJoin(trainingSessionsTable, eq(attendanceTable.sessionId, trainingSessionsTable.id))
    .where(and(eq(attendanceTable.studentId, student.userId), eq(trainingSessionsTable.modality, "jiu")));

  res.json({
    id: student.id,
    userId: student.userId,
    name: student.name,
    email: student.email,
    unit: student.unit,
    profilePhotoUrl: student.profilePhotoUrl ?? null,
    modalityThai: student.modalityThai,
    modalityJiu: student.modalityJiu,
    bollacha: student.bollacha,
    thaiGrade: student.thaiGrade ?? null,
    jiuGrade: student.jiuGrade ?? null,
    jiuDegree: student.jiuDegree ?? null,
    thaiGradeColor: student.thaiGradeColor ?? null,
    jiuGradeColor: student.jiuGradeColor ?? null,
    hasFaceDescriptor: student.faceDescriptor !== null,
    totalAttendanceThai: thaiCount[0]?.count ?? 0,
    totalAttendanceJiu: jiuCount[0]?.count ?? 0,
    createdAt: student.createdAt.toISOString(),
  });
});

// PATCH /students/:id — atualiza o perfil de treino de um aluno.
router.patch("/students/:id", async (req, res): Promise<void> => {
  const params = UpdateStudentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = UpdateStudentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  // Descobre, pela sessão, se quem faz a alteração é um aluno (regra de authz).
  const requesterId = (req.session as unknown as Record<string, unknown>).userId as number | undefined;
  const requesterIsStudent = requesterId
    ? (await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, requesterId)))[0]?.role === "student"
    : false;

  // Authz: alunos NÃO podem alterar campos de graduação — eles são removidos do
  // update quando o requester é aluno (apenas professor/admin gradua).
  const GRADE_FIELDS = ["thaiGrade", "thaiGradeColor", "jiuGrade", "jiuGradeColor", "jiuDegree"] as const;
  const updateData = requesterIsStudent
    ? Object.fromEntries(Object.entries(body.data).filter(([k]) => !GRADE_FIELDS.includes(k as typeof GRADE_FIELDS[number])))
    : body.data;

  // Se sobrou algo para atualizar, executa o UPDATE; caso contrário (aluno
  // enviou só campos de graduação, todos filtrados), apenas lê o perfil atual.
  const [profile] = Object.keys(updateData).length > 0
    ? await db.update(studentProfilesTable).set(updateData).where(eq(studentProfilesTable.userId, params.data.id)).returning()
    : await db.select().from(studentProfilesTable).where(eq(studentProfilesTable.userId, params.data.id));

  if (!profile) {
    res.status(404).json({ error: "Student not found" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));

  res.json({
    id: profile.id,
    userId: user.id,
    name: user.name,
    email: user.email,
    unit: user.unit,
    profilePhotoUrl: user.profilePhotoUrl ?? null,
    modalityThai: profile.modalityThai,
    modalityJiu: profile.modalityJiu,
    bollacha: profile.bollacha,
    thaiGrade: profile.thaiGrade ?? null,
    jiuGrade: profile.jiuGrade ?? null,
    jiuDegree: profile.jiuDegree ?? null,
    thaiGradeColor: profile.thaiGradeColor ?? null,
    jiuGradeColor: profile.jiuGradeColor ?? null,
    hasFaceDescriptor: profile.faceDescriptor !== null,
    totalAttendanceThai: 0,
    totalAttendanceJiu: 0,
    createdAt: user.createdAt.toISOString(),
  });
});


export default router;
