// =============================================================================
// routes/attendance.ts — Rotas de presença (attendance).
// Lista presenças com filtros, cria registros avulsos, remove registros e
// expõe o endpoint de presença em massa (/attendance/bulk) usado pelo
// reconhecimento facial. O bulk é restrito a professores/admin; a modalidade é
// escolhida pelo professor (uma só por importação), nunca derivada do aluno.
// =============================================================================
import { Router, type IRouter } from "express";
import { eq, and, sql, gte, lte, inArray } from "drizzle-orm";
import { db, attendanceTable, usersTable, trainingSessionsTable } from "@workspace/db";
import {
  ListAttendanceQueryParams,
  CreateAttendanceBody,
  DeleteAttendanceParams,
  BulkAttendanceBody,
  GetAttendanceSummaryQueryParams,
} from "@workspace/api-zod";
import { getSessionUserId, getRequester, isMasterRole } from "../lib/authz";

const router: IRouter = Router();

// GET /attendance — lista registros de presença com filtros opcionais
// (sessão, aluno, modalidade), mais recentes primeiro, já com dados do aluno.
// Master vê tudo; aluno só pode consultar a própria presença (studentId tem
// que ser o dele mesmo — sem filtro, ou filtro de outro aluno, é bloqueado).
router.get("/attendance", async (req, res): Promise<void> => {
  const requester = await getRequester(getSessionUserId(req));
  if (!requester) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const query = ListAttendanceQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  if (!isMasterRole(requester.role) && query.data.studentId !== requester.id) {
    res.status(403).json({ error: "Você só pode ver a própria presença" });
    return;
  }

  // Monta os filtros opcionais (sessão, aluno e modalidade da sessão).
  const conditions: ReturnType<typeof eq>[] = [];
  if (query.data.sessionId) {
    conditions.push(eq(attendanceTable.sessionId, query.data.sessionId));
  }
  if (query.data.studentId) {
    conditions.push(eq(attendanceTable.studentId, query.data.studentId));
  }
  if (query.data.modality) {
    conditions.push(eq(trainingSessionsTable.modality, query.data.modality as "thai" | "jiu"));
  }

  // Junta usuário (nome/foto) e sessão (modalidade) ao registro de presença.
  const records = await db
    .select({
      id: attendanceTable.id,
      sessionId: attendanceTable.sessionId,
      studentId: attendanceTable.studentId,
      studentName: usersTable.name,
      studentPhotoUrl: usersTable.profilePhotoUrl,
      modality: trainingSessionsTable.modality,
      postTrainingPhotoUrl: attendanceTable.postTrainingPhotoUrl,
      faceRecognized: attendanceTable.faceRecognized,
      createdAt: attendanceTable.createdAt,
    })
    .from(attendanceTable)
    .innerJoin(usersTable, eq(attendanceTable.studentId, usersTable.id))
    .innerJoin(trainingSessionsTable, eq(attendanceTable.sessionId, trainingSessionsTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sql`${attendanceTable.createdAt} DESC`);

  res.json(records.map(r => ({
    id: r.id,
    sessionId: r.sessionId,
    studentId: r.studentId,
    studentName: r.studentName,
    studentPhotoUrl: r.studentPhotoUrl ?? null,
    modality: r.modality,
    postTrainingPhotoUrl: r.postTrainingPhotoUrl ?? null,
    faceRecognized: r.faceRecognized,
    createdAt: r.createdAt.toISOString(),
  })));
});

// POST /attendance — cria um registro de presença avulso (1 aluno em 1 sessão).
// Master-only: marcar presença é ação do professor/admin, nunca autorreportada.
router.post("/attendance", async (req, res): Promise<void> => {
  const requester = await getRequester(getSessionUserId(req));
  if (!requester) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  if (!isMasterRole(requester.role)) {
    res.status(403).json({ error: "Acesso restrito a professores e administradores" });
    return;
  }

  const body = CreateAttendanceBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  // Insere a presença; faceRecognized indica se veio do reconhecimento facial.
  const [record] = await db.insert(attendanceTable).values({
    sessionId: body.data.sessionId,
    studentId: body.data.studentId,
    postTrainingPhotoUrl: body.data.postTrainingPhotoUrl,
    faceRecognized: body.data.faceRecognized ?? false,
  }).returning();

  // Busca dados do aluno e da sessão para devolver a presença já enriquecida.
  const [student] = await db.select().from(usersTable).where(eq(usersTable.id, body.data.studentId));
  const [session] = await db.select().from(trainingSessionsTable).where(eq(trainingSessionsTable.id, body.data.sessionId));

  res.status(201).json({
    id: record.id,
    sessionId: record.sessionId,
    studentId: record.studentId,
    studentName: student?.name ?? "Unknown",
    studentPhotoUrl: student?.profilePhotoUrl ?? null,
    modality: session?.modality ?? "thai",
    postTrainingPhotoUrl: record.postTrainingPhotoUrl ?? null,
    faceRecognized: record.faceRecognized,
    createdAt: record.createdAt.toISOString(),
  });
});

// POST /attendance/bulk — registra presença de vários alunos de uma vez numa
// única modalidade (escolhida pelo professor para a foto da equipe), tipicamente
// após o reconhecimento facial. Cria/reaproveita a sessão do dia dessa
// modalidade e evita marcações duplicadas.
router.post("/attendance/bulk", async (req, res): Promise<void> => {
  // Authz: bulk attendance (facial recognition) is restricted to teachers/admins.
  // (Authz: presença em massa é restrita a professores/admin.)
  const requesterId = (req.session as unknown as Record<string, unknown>).userId as number | undefined;
  const requester = requesterId
    ? (await db.select({ id: usersTable.id, role: usersTable.role }).from(usersTable).where(eq(usersTable.id, requesterId)))[0]
    : undefined;
  if (!requester) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  if (requester.role !== "teacher" && requester.role !== "admin") {
    res.status(403).json({ error: "Apenas professores podem registrar presença em massa" });
    return;
  }

  const body = BulkAttendanceBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const { photoUrl, modality, students } = body.data;
  // Trust the authenticated requester as the session owner, not the client payload.
  // (O dono da sessão é o professor autenticado — nunca um id vindo do cliente.)
  const teacherId = requester.id;

  // Janela do dia de hoje (00:00 até 23:59:59.999), usada para achar/criar a
  // sessão "de hoje" da modalidade escolhida.
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  // Sessão de hoje para a modalidade escolhida: reaproveita as existentes do dia
  // (guardando todos os ids para o dedupe) ou cria uma nova se não houver.
  const todays = await db
    .select({ id: trainingSessionsTable.id })
    .from(trainingSessionsTable)
    .where(
      and(
        eq(trainingSessionsTable.modality, modality),
        gte(trainingSessionsTable.sessionDate, startOfDay),
        lte(trainingSessionsTable.sessionDate, endOfDay),
      ),
    )
    .orderBy(sql`${trainingSessionsTable.sessionDate} DESC`);

  let sessionIds = todays.map((s) => s.id);
  let sessionId: number;
  if (sessionIds.length > 0) {
    sessionId = sessionIds[0];
  } else {
    const [createdSession] = await db
      .insert(trainingSessionsTable)
      .values({
        modality,
        sessionDate: now,
        description: "Presença via reconhecimento facial",
        teacherId,
      })
      .returning({ id: trainingSessionsTable.id });
    sessionId = createdSession.id;
    sessionIds = [createdSession.id];
  }

  // Contadores do resultado: quantas presenças foram criadas e quantas puladas.
  let created = 0;
  let skipped = 0;

  for (const studentId of students) {
    // Dedupe: a student should not be marked twice in the same modality today.
    // (Evita marcar o mesmo aluno duas vezes na mesma modalidade no dia.)
    const existing = await db
      .select({ id: attendanceTable.id })
      .from(attendanceTable)
      .where(
        and(
          eq(attendanceTable.studentId, studentId),
          inArray(attendanceTable.sessionId, sessionIds),
        ),
      )
      .limit(1);

    // Já marcado hoje nessa modalidade → pula (incrementa skipped).
    if (existing.length > 0) {
      skipped += 1;
      continue;
    }

    // Registra a presença na sessão do dia, marcando faceRecognized=true.
    await db.insert(attendanceTable).values({
      sessionId,
      studentId,
      postTrainingPhotoUrl: photoUrl,
      faceRecognized: true,
    });
    created += 1;
  }

  res.json({ created, skipped });
});

// DELETE /attendance/:id — remove um registro de presença pelo id. Master-only.
router.delete("/attendance/:id", async (req, res): Promise<void> => {
  const requester = await getRequester(getSessionUserId(req));
  if (!requester) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  if (!isMasterRole(requester.role)) {
    res.status(403).json({ error: "Acesso restrito a professores e administradores" });
    return;
  }

  const params = DeleteAttendanceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Retorno vazio = id inexistente → 404.
  const [record] = await db.delete(attendanceTable).where(eq(attendanceTable.id, params.data.id)).returning();
  if (!record) {
    res.status(404).json({ error: "Attendance record not found" });
    return;
  }

  res.json({ message: "Attendance record deleted successfully" });
});

// GET /attendance/summary — total de presenças de um mês/ano por pessoa (alunos
// e professores/admins). Master recebe uma linha por pessoa com atividade no
// mês; aluno recebe só a própria linha (mesmo que zerada). Sábado de Muay Thai
// conta em dobro, mesma regra usada em routes/students.ts e routes/rankings.ts.
router.get("/attendance/summary", async (req, res): Promise<void> => {
  const requester = await getRequester(getSessionUserId(req));
  if (!requester) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const query = GetAttendanceSummaryQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const { month, year } = query.data;

  // Janela do mês (00:00 do dia 1 até 23:59:59.999 do último dia).
  const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

  // Soma ponderada por aluno+modalidade dentro do mês (sábado Thai = 2).
  const rows = await db
    .select({
      studentId: attendanceTable.studentId,
      modality: trainingSessionsTable.modality,
      weighted: sql<number>`SUM(CASE WHEN ${trainingSessionsTable.modality} = 'thai' AND EXTRACT(DOW FROM ${trainingSessionsTable.sessionDate}) = 6 THEN 2 ELSE 1 END)::int`,
    })
    .from(attendanceTable)
    .innerJoin(trainingSessionsTable, eq(attendanceTable.sessionId, trainingSessionsTable.id))
    .where(and(
      gte(trainingSessionsTable.sessionDate, startOfMonth),
      lte(trainingSessionsTable.sessionDate, endOfMonth),
    ))
    .groupBy(attendanceTable.studentId, trainingSessionsTable.modality);

  // Combina as duas modalidades por pessoa.
  const totals = new Map<number, { totalThai: number; totalJiu: number }>();
  for (const r of rows) {
    const entry = totals.get(r.studentId) ?? { totalThai: 0, totalJiu: 0 };
    if (r.modality === "thai") entry.totalThai += r.weighted;
    else entry.totalJiu += r.weighted;
    totals.set(r.studentId, entry);
  }

  // Aluno: só a própria linha, mesmo que zerada (quer ver o próprio total do mês).
  if (!isMasterRole(requester.role)) {
    const [me] = await db.select({ name: usersTable.name, profilePhotoUrl: usersTable.profilePhotoUrl })
      .from(usersTable).where(eq(usersTable.id, requester.id));
    const own = totals.get(requester.id) ?? { totalThai: 0, totalJiu: 0 };
    res.json([{
      userId: requester.id,
      name: me?.name ?? "",
      profilePhotoUrl: me?.profilePhotoUrl ?? null,
      role: requester.role,
      totalThai: own.totalThai,
      totalJiu: own.totalJiu,
      total: own.totalThai + own.totalJiu,
      month,
      year,
    }]);
    return;
  }

  // Master: uma linha por pessoa que teve atividade no mês (alunos e professores/admins).
  const userIds = [...totals.keys()];
  if (userIds.length === 0) {
    res.json([]);
    return;
  }
  const people = await db
    .select({ id: usersTable.id, name: usersTable.name, profilePhotoUrl: usersTable.profilePhotoUrl, role: usersTable.role })
    .from(usersTable)
    .where(inArray(usersTable.id, userIds));

  res.json(
    people
      .map(p => {
        const t = totals.get(p.id)!;
        return {
          userId: p.id,
          name: p.name,
          profilePhotoUrl: p.profilePhotoUrl ?? null,
          role: p.role,
          totalThai: t.totalThai,
          totalJiu: t.totalJiu,
          total: t.totalThai + t.totalJiu,
          month,
          year,
        };
      })
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
  );
});

export default router;
