import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, trainingSessionsTable, usersTable, attendanceTable } from "@workspace/db";
import {
  ListSessionsQueryParams,
  CreateSessionBody,
  GetSessionParams,
  DeleteSessionParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/sessions", async (req, res): Promise<void> => {
  const query = ListSessionsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const conditions: ReturnType<typeof eq>[] = [];
  if (query.data.modality) {
    conditions.push(eq(trainingSessionsTable.modality, query.data.modality as "thai" | "jiu"));
  }

  const sessions = await db
    .select({
      id: trainingSessionsTable.id,
      modality: trainingSessionsTable.modality,
      sessionDate: trainingSessionsTable.sessionDate,
      description: trainingSessionsTable.description,
      teacherId: trainingSessionsTable.teacherId,
      teacherName: usersTable.name,
      createdAt: trainingSessionsTable.createdAt,
    })
    .from(trainingSessionsTable)
    .innerJoin(usersTable, eq(trainingSessionsTable.teacherId, usersTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sql`${trainingSessionsTable.sessionDate} DESC`);

  const attendanceCounts = await db
    .select({
      sessionId: attendanceTable.sessionId,
      count: sql<number>`count(*)::int`,
    })
    .from(attendanceTable)
    .groupBy(attendanceTable.sessionId);

  const countMap = new Map(attendanceCounts.map(a => [a.sessionId, a.count]));

  res.json(sessions.map(s => ({
    id: s.id,
    modality: s.modality,
    sessionDate: s.sessionDate.toISOString(),
    description: s.description ?? null,
    teacherId: s.teacherId,
    teacherName: s.teacherName,
    attendanceCount: countMap.get(s.id) ?? 0,
    createdAt: s.createdAt.toISOString(),
  })));
});

router.post("/sessions", async (req, res): Promise<void> => {
  const body = CreateSessionBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [session] = await db.insert(trainingSessionsTable).values({
    modality: body.data.modality as "thai" | "jiu",
    sessionDate: new Date(body.data.sessionDate),
    description: body.data.description,
    teacherId: body.data.teacherId,
  }).returning();

  const [teacher] = await db.select().from(usersTable).where(eq(usersTable.id, session.teacherId));

  res.status(201).json({
    id: session.id,
    modality: session.modality,
    sessionDate: session.sessionDate.toISOString(),
    description: session.description ?? null,
    teacherId: session.teacherId,
    teacherName: teacher?.name ?? "Unknown",
    attendanceCount: 0,
    createdAt: session.createdAt.toISOString(),
  });
});

router.get("/sessions/:id", async (req, res): Promise<void> => {
  const params = GetSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [session] = await db
    .select({
      id: trainingSessionsTable.id,
      modality: trainingSessionsTable.modality,
      sessionDate: trainingSessionsTable.sessionDate,
      description: trainingSessionsTable.description,
      teacherId: trainingSessionsTable.teacherId,
      teacherName: usersTable.name,
      createdAt: trainingSessionsTable.createdAt,
    })
    .from(trainingSessionsTable)
    .innerJoin(usersTable, eq(trainingSessionsTable.teacherId, usersTable.id))
    .where(eq(trainingSessionsTable.id, params.data.id));

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const [count] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(attendanceTable)
    .where(eq(attendanceTable.sessionId, params.data.id));

  res.json({
    id: session.id,
    modality: session.modality,
    sessionDate: session.sessionDate.toISOString(),
    description: session.description ?? null,
    teacherId: session.teacherId,
    teacherName: session.teacherName,
    attendanceCount: count?.count ?? 0,
    createdAt: session.createdAt.toISOString(),
  });
});

router.delete("/sessions/:id", async (req, res): Promise<void> => {
  const params = DeleteSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [session] = await db
    .delete(trainingSessionsTable)
    .where(eq(trainingSessionsTable.id, params.data.id))
    .returning();

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  res.json({ message: "Session deleted successfully" });
});

export default router;
