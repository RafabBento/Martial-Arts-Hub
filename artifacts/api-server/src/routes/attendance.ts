import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, attendanceTable, usersTable, trainingSessionsTable } from "@workspace/db";
import {
  ListAttendanceQueryParams,
  CreateAttendanceBody,
  DeleteAttendanceParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/attendance", async (req, res): Promise<void> => {
  const query = ListAttendanceQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

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

router.post("/attendance", async (req, res): Promise<void> => {
  const body = CreateAttendanceBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [record] = await db.insert(attendanceTable).values({
    sessionId: body.data.sessionId,
    studentId: body.data.studentId,
    postTrainingPhotoUrl: body.data.postTrainingPhotoUrl,
    faceRecognized: body.data.faceRecognized ?? false,
  }).returning();

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

router.delete("/attendance/:id", async (req, res): Promise<void> => {
  const params = DeleteAttendanceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [record] = await db.delete(attendanceTable).where(eq(attendanceTable.id, params.data.id)).returning();
  if (!record) {
    res.status(404).json({ error: "Attendance record not found" });
    return;
  }

  res.json({ message: "Attendance record deleted successfully" });
});

export default router;
