import { Router, type IRouter } from "express";
import { eq, and, sql, gte } from "drizzle-orm";
import { db, attendanceTable, usersTable, studentProfilesTable, trainingSessionsTable } from "@workspace/db";
import { ListRankingsQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/rankings", async (req, res): Promise<void> => {
  const query = ListRankingsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const modality = query.data.modality ?? "both";
  const period = query.data.period ?? "all";

  let dateFilter: Date | null = null;
  const now = new Date();
  if (period === "week") {
    dateFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (period === "month") {
    dateFilter = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (period === "year") {
    dateFilter = new Date(now.getFullYear(), 0, 1);
  }

  const modalityFilter = modality !== "both" ? modality as "thai" | "jiu" : null;

  const totalSessionsQuery = db
    .select({ count: sql<number>`count(*)::int` })
    .from(trainingSessionsTable)
    .where(
      and(
        modalityFilter ? eq(trainingSessionsTable.modality, modalityFilter) : undefined,
        dateFilter ? gte(trainingSessionsTable.sessionDate, dateFilter) : undefined,
      )
    );

  const [{ count: totalSessions }] = await totalSessionsQuery;

  const studentsQuery = await db
    .select({
      userId: usersTable.id,
      name: usersTable.name,
      profilePhotoUrl: usersTable.profilePhotoUrl,
      thaiGrade: studentProfilesTable.thaiGrade,
      jiuGrade: studentProfilesTable.jiuGrade,
      thaiGradeColor: studentProfilesTable.thaiGradeColor,
      jiuGradeColor: studentProfilesTable.jiuGradeColor,
      presentCount: sql<number>`count(${attendanceTable.id})::int`,
    })
    .from(usersTable)
    .innerJoin(studentProfilesTable, eq(usersTable.id, studentProfilesTable.userId))
    .leftJoin(attendanceTable, and(
      eq(attendanceTable.studentId, usersTable.id),
      sql`EXISTS (
        SELECT 1 FROM training_sessions ts
        WHERE ts.id = ${attendanceTable.sessionId}
        ${modalityFilter ? sql`AND ts.modality = ${modalityFilter}` : sql``}
        ${dateFilter ? sql`AND ts.session_date >= ${dateFilter}` : sql``}
      )`
    ))
    .where(eq(usersTable.role, "student"))
    .groupBy(
      usersTable.id,
      usersTable.name,
      usersTable.profilePhotoUrl,
      studentProfilesTable.thaiGrade,
      studentProfilesTable.jiuGrade,
      studentProfilesTable.thaiGradeColor,
      studentProfilesTable.jiuGradeColor
    )
    .orderBy(sql`count(${attendanceTable.id}) DESC`);

  const rankings = studentsQuery.map((s, index) => ({
    rank: index + 1,
    studentId: s.userId,
    name: s.name,
    profilePhotoUrl: s.profilePhotoUrl ?? null,
    thaiGrade: s.thaiGrade ?? null,
    jiuGrade: s.jiuGrade ?? null,
    thaiGradeColor: s.thaiGradeColor ?? null,
    jiuGradeColor: s.jiuGradeColor ?? null,
    totalSessions: totalSessions ?? 0,
    presentCount: s.presentCount,
    percentage: totalSessions > 0 ? Math.round((s.presentCount / totalSessions) * 100) : 0,
    modality: modality,
  }));

  res.json(rankings);
});

export default router;
