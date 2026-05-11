import { Router, type IRouter } from "express";
import { eq, and, sql, gte, inArray } from "drizzle-orm";
import { db, usersTable, trainingSessionsTable, attendanceTable, studentProfilesTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/stats/dashboard", async (req, res): Promise<void> => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [{ totalStudents }] = await db
    .select({ totalStudents: sql<number>`count(*)::int` })
    .from(usersTable)
    .where(eq(usersTable.role, "student"));

  const [{ totalTeachers }] = await db
    .select({ totalTeachers: sql<number>`count(*)::int` })
    .from(usersTable)
    .where(eq(usersTable.role, "teacher"));

  const [{ totalSessionsThai }] = await db
    .select({ totalSessionsThai: sql<number>`count(*)::int` })
    .from(trainingSessionsTable)
    .where(eq(trainingSessionsTable.modality, "thai"));

  const [{ totalSessionsJiu }] = await db
    .select({ totalSessionsJiu: sql<number>`count(*)::int` })
    .from(trainingSessionsTable)
    .where(eq(trainingSessionsTable.modality, "jiu"));

  const todaySessions = await db
    .select({ id: trainingSessionsTable.id, modality: trainingSessionsTable.modality })
    .from(trainingSessionsTable)
    .where(gte(trainingSessionsTable.sessionDate, todayStart));

  const todayThaiIds = todaySessions.filter(s => s.modality === "thai").map(s => s.id);
  const todayJiuIds = todaySessions.filter(s => s.modality === "jiu").map(s => s.id);

  const attendanceTodayThai = todayThaiIds.length > 0
    ? ((await db.select({ count: sql<number>`count(*)::int` }).from(attendanceTable).where(inArray(attendanceTable.sessionId, todayThaiIds)))[0]?.count ?? 0)
    : 0;

  const attendanceTodayJiu = todayJiuIds.length > 0
    ? ((await db.select({ count: sql<number>`count(*)::int` }).from(attendanceTable).where(inArray(attendanceTable.sessionId, todayJiuIds)))[0]?.count ?? 0)
    : 0;

  const monthSessions = await db
    .select({ id: trainingSessionsTable.id })
    .from(trainingSessionsTable)
    .where(gte(trainingSessionsTable.sessionDate, monthStart));

  const monthSessionIds = monthSessions.map(s => s.id);
  const totalAttendanceThisMonth = monthSessionIds.length > 0
    ? ((await db.select({ count: sql<number>`count(*)::int` }).from(attendanceTable).where(inArray(attendanceTable.sessionId, monthSessionIds)))[0]?.count ?? 0)
    : 0;

  const [{ studentsThaiOnly }] = await db
    .select({ studentsThaiOnly: sql<number>`count(*)::int` })
    .from(studentProfilesTable)
    .where(and(eq(studentProfilesTable.modalityThai, true), eq(studentProfilesTable.modalityJiu, false)));

  const [{ studentsJiuOnly }] = await db
    .select({ studentsJiuOnly: sql<number>`count(*)::int` })
    .from(studentProfilesTable)
    .where(and(eq(studentProfilesTable.modalityJiu, true), eq(studentProfilesTable.modalityThai, false)));

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

router.get("/stats/recent-activity", async (req, res): Promise<void> => {
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
