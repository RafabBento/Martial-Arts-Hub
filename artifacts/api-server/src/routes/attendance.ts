// =============================================================================
// routes/attendance.ts — Rotas de presença (attendance).
// Lista presenças com filtros, cria registros avulsos, remove registros e
// expõe o endpoint de presença em massa (/attendance/bulk) usado pelo
// reconhecimento facial. O bulk é restrito a professores/admin e deriva as
// modalidades do perfil de cada aluno (nunca do payload do cliente).
// =============================================================================
import { Router, type IRouter } from "express";
import { eq, and, sql, gte, lte, inArray } from "drizzle-orm";
import { db, attendanceTable, usersTable, studentProfilesTable, trainingSessionsTable } from "@workspace/db";
import {
  ListAttendanceQueryParams,
  CreateAttendanceBody,
  DeleteAttendanceParams,
  BulkAttendanceBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

// GET /attendance — lista registros de presença com filtros opcionais
// (sessão, aluno, modalidade), mais recentes primeiro, já com dados do aluno.
router.get("/attendance", async (req, res): Promise<void> => {
  const query = ListAttendanceQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
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
router.post("/attendance", async (req, res): Promise<void> => {
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

// POST /attendance/bulk — registra presença de vários alunos de uma vez,
// tipicamente após o reconhecimento facial da foto da equipe. Cria/reaproveita
// a sessão do dia por modalidade e evita marcações duplicadas.
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

  const { photoUrl, students } = body.data;
  // Trust the authenticated requester as the session owner, not the client payload.
  // (O dono da sessão é o professor autenticado — nunca um id vindo do cliente.)
  const teacherId = requester.id;

  // Janela do dia de hoje (00:00 até 23:59:59.999), usada para achar/criar a
  // sessão "de hoje" de cada modalidade.
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  // Cache das sessões de hoje por modalidade, criadas sob demanda (lazy).
  const sessionByModality = new Map<"thai" | "jiu", { id: number; ids: number[] }>();

  // Garante uma sessão de hoje para a modalidade: reaproveita as existentes do
  // dia (guardando todos os ids para o dedupe) ou cria uma nova se não houver.
  async function ensureSession(modality: "thai" | "jiu"): Promise<{ id: number; ids: number[] }> {
    const cached = sessionByModality.get(modality);
    if (cached) return cached;

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

    let ids = todays.map((s) => s.id);
    let primaryId: number;
    if (ids.length > 0) {
      primaryId = ids[0];
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
      primaryId = createdSession.id;
      ids = [createdSession.id];
    }

    const entry = { id: primaryId, ids };
    sessionByModality.set(modality, entry);
    return entry;
  }

  // Contadores do resultado: quantas presenças foram criadas e quantas puladas.
  let created = 0;
  let skipped = 0;

  for (const student of students) {
    // Derive modalities from the student's registration, never from the client
    // payload — attendance must follow each student's registered modalities.
    // (As modalidades vêm SEMPRE do cadastro do aluno, nunca do payload.)
    const [profile] = await db
      .select({ thai: studentProfilesTable.modalityThai, jiu: studentProfilesTable.modalityJiu })
      .from(studentProfilesTable)
      .where(eq(studentProfilesTable.userId, student.studentId));
    if (!profile) {
      skipped += 1;
      continue;
    }
    // Constrói a lista de modalidades em que o aluno está inscrito.
    const modalities: ("thai" | "jiu")[] = [];
    if (profile.thai) modalities.push("thai");
    if (profile.jiu) modalities.push("jiu");
    for (const modality of modalities) {
      const session = await ensureSession(modality);

      // Dedupe: a student should not be marked twice in the same modality today.
      // (Evita marcar o mesmo aluno duas vezes na mesma modalidade no dia.)
      const existing = await db
        .select({ id: attendanceTable.id })
        .from(attendanceTable)
        .where(
          and(
            eq(attendanceTable.studentId, student.studentId),
            inArray(attendanceTable.sessionId, session.ids),
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
        sessionId: session.id,
        studentId: student.studentId,
        postTrainingPhotoUrl: photoUrl,
        faceRecognized: true,
      });
      created += 1;
    }
  }

  res.json({ created, skipped });
});

// DELETE /attendance/:id — remove um registro de presença pelo id.
router.delete("/attendance/:id", async (req, res): Promise<void> => {
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

export default router;
