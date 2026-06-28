// =============================================================================
// routes/stats.ts — Estatísticas agregadas para o dashboard.
// Fornece números totais (alunos, professores, sessões, presenças) e a lista
// das atividades mais recentes, consumidos pela tela inicial/painel.
// =============================================================================
import { Router, type IRouter } from "express";
import { eq, and, sql, gte, inArray } from "drizzle-orm";
import { db, usersTable, trainingSessionsTable, attendanceTable, studentProfilesTable } from "@workspace/db";

const router: IRouter = Router();

// GET /stats/dashboard — números consolidados para os cartões do painel.
router.get("/stats/dashboard", async (req, res): Promise<void> => {
  // Marcos de tempo: início do dia e início do mês corrente (filtros de período).
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Total de alunos cadastrados.
  const [{ totalStudents }] = await db
    .select({ totalStudents: sql<number>`count(*)::int` })
    .from(usersTable)
    .where(eq(usersTable.role, "student"));

  // Total de professores cadastrados.
  const [{ totalTeachers }] = await db
    .select({ totalTeachers: sql<number>`count(*)::int` })
    .from(usersTable)
    .where(eq(usersTable.role, "teacher"));

  // Total de sessões de Muay Thai já realizadas.
  const [{ totalSessionsThai }] = await db
    .select({ totalSessionsThai: sql<number>`count(*)::int` })
    .from(trainingSessionsTable)
    .where(eq(trainingSessionsTable.modality, "thai"));

  // Total de sessões de Jiu-Jitsu já realizadas.
  const [{ totalSessionsJiu }] = await db
    .select({ totalSessionsJiu: sql<number>`count(*)::int` })
    .from(trainingSessionsTable)
    .where(eq(trainingSessionsTable.modality, "jiu"));

  // Sessões de hoje, separadas por modalidade para contar presenças do dia.
  const todaySessions = await db
    .select({ id: trainingSessionsTable.id, modality: trainingSessionsTable.modality })
    .from(trainingSessionsTable)
    .where(gte(trainingSessionsTable.sessionDate, todayStart));

  const todayThaiIds = todaySessions.filter(s => s.modality === "thai").map(s => s.id);
  const todayJiuIds = todaySessions.filter(s => s.modality === "jiu").map(s => s.id);

  // Presenças de hoje em Muay Thai (0 se não houve sessão Thai hoje).
  const attendanceTodayThai = todayThaiIds.length > 0
    ? ((await db.select({ count: sql<number>`count(*)::int` }).from(attendanceTable).where(inArray(attendanceTable.sessionId, todayThaiIds)))[0]?.count ?? 0)
    : 0;

  // Presenças de hoje em Jiu-Jitsu (0 se não houve sessão Jiu hoje).
  const attendanceTodayJiu = todayJiuIds.length > 0
    ? ((await db.select({ count: sql<number>`count(*)::int` }).from(attendanceTable).where(inArray(attendanceTable.sessionId, todayJiuIds)))[0]?.count ?? 0)
    : 0;

  // Sessões do mês corrente, para somar todas as presenças do mês.
  const monthSessions = await db
    .select({ id: trainingSessionsTable.id })
    .from(trainingSessionsTable)
    .where(gte(trainingSessionsTable.sessionDate, monthStart));

  const monthSessionIds = monthSessions.map(s => s.id);
  // Total de presenças no mês (0 se não houve sessões no mês).
  const totalAttendanceThisMonth = monthSessionIds.length > 0
    ? ((await db.select({ count: sql<number>`count(*)::int` }).from(attendanceTable).where(inArray(attendanceTable.sessionId, monthSessionIds)))[0]?.count ?? 0)
    : 0;

  // Distribuição de alunos por modalidade: só Thai.
  const [{ studentsThaiOnly }] = await db
    .select({ studentsThaiOnly: sql<number>`count(*)::int` })
    .from(studentProfilesTable)
    .where(and(eq(studentProfilesTable.modalityThai, true), eq(studentProfilesTable.modalityJiu, false)));

  // Distribuição de alunos por modalidade: só Jiu.
  const [{ studentsJiuOnly }] = await db
    .select({ studentsJiuOnly: sql<number>`count(*)::int` })
    .from(studentProfilesTable)
    .where(and(eq(studentProfilesTable.modalityJiu, true), eq(studentProfilesTable.modalityThai, false)));

  // Distribuição de alunos por modalidade: ambas (Thai + Jiu).
  const [{ studentsBoth }] = await db
    .select({ studentsBoth: sql<number>`count(*)::int` })
    .from(studentProfilesTable)
    .where(and(eq(studentProfilesTable.modalityThai, true), eq(studentProfilesTable.modalityJiu, true)));

  res.json({
    totalStudents,
    totalTeachers,
    totalSessionsThai,
    totalSessionsJiu,
    attendanceTodayThai,
    attendanceTodayJiu,
    totalAttendanceThisMonth,
    studentsThaiOnly,
    studentsJiuOnly,
    studentsBoth,
  });
});

// GET /stats/recent-activity — últimas 20 presenças para o feed de atividades.
router.get("/stats/recent-activity", async (req, res): Promise<void> => {
  // Junta presença → aluno → sessão para montar a descrição da atividade,
  // ordenando da mais recente para a mais antiga (limite de 20).
  const records = await db
    .select({
      id: attendanceTable.id,
      studentName: usersTable.name,
      studentPhotoUrl: usersTable.profilePhotoUrl,
      modality: trainingSessionsTable.modality,
      createdAt: attendanceTable.createdAt,
    })
    .from(attendanceTable)
    .innerJoin(usersTable, eq(attendanceTable.studentId, usersTable.id))
    .innerJoin(trainingSessionsTable, eq(attendanceTable.sessionId, trainingSessionsTable.id))
    .orderBy(sql`${attendanceTable.createdAt} DESC`)
    .limit(20);

  // Formata cada registro com uma frase em pt-BR (ex.: "Fulano treinou Muay Thai").
  res.json(records.map(r => ({
    id: r.id,
    type: "attendance",
    description: `${r.studentName} treinou ${r.modality === "thai" ? "Muay Thai" : "Jiu-Jitsu"}`,
    studentName: r.studentName,
    studentPhotoUrl: r.studentPhotoUrl ?? null,
    modality: r.modality,
    createdAt: r.createdAt.toISOString(),
  })));
});

export default router;
