import { Router, type IRouter } from "express";
import { eq, and, ilike, or } from "drizzle-orm";
import { db, usersTable, studentProfilesTable, attendanceTable, trainingSessionsTable } from "@workspace/db";
import {
  ListStudentsQueryParams,
  GetStudentParams,
  UpdateStudentParams,
  UpdateStudentBody,
  SaveFaceDescriptorParams,
  SaveFaceDescriptorBody,
  IdentifyFaceBody,
} from "@workspace/api-zod";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/students", async (req, res): Promise<void> => {
  const query = ListStudentsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  let conditions: ReturnType<typeof eq>[] = [eq(usersTable.role, "student")];

  if (query.data.modality === "thai") {
    conditions.push(eq(studentProfilesTable.modalityThai, true));
  } else if (query.data.modality === "jiu") {
    conditions.push(eq(studentProfilesTable.modalityJiu, true));
  } else if (query.data.modality === "both") {
    conditions.push(eq(studentProfilesTable.modalityThai, true));
    conditions.push(eq(studentProfilesTable.modalityJiu, true));
  }

  let joinQuery = db
    .select({
      id: studentProfilesTable.id,
      userId: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      profilePhotoUrl: usersTable.profilePhotoUrl,
      modalityThai: studentProfilesTable.modalityThai,
      modalityJiu: studentProfilesTable.modalityJiu,
      thaiGrade: studentProfilesTable.thaiGrade,
      jiuGrade: studentProfilesTable.jiuGrade,
      thaiGradeColor: studentProfilesTable.thaiGradeColor,
      jiuGradeColor: studentProfilesTable.jiuGradeColor,
      faceDescriptor: studentProfilesTable.faceDescriptor,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .innerJoin(studentProfilesTable, eq(usersTable.id, studentProfilesTable.userId))
    .where(and(...conditions))
    .$dynamic();

  if (query.data.search) {
    const search = `%${query.data.search}%`;
    joinQuery = joinQuery.where(or(ilike(usersTable.name, search), ilike(usersTable.email, search)));
  }

  const students = await joinQuery;

  const thaiAttendance = await db
    .select({
      studentId: attendanceTable.studentId,
      count: sql<number>`count(*)::int`,
    })
    .from(attendanceTable)
    .innerJoin(trainingSessionsTable, eq(attendanceTable.sessionId, trainingSessionsTable.id))
    .where(eq(trainingSessionsTable.modality, "thai"))
    .groupBy(attendanceTable.studentId);

  const jiuAttendance = await db
    .select({
      studentId: attendanceTable.studentId,
      count: sql<number>`count(*)::int`,
    })
    .from(attendanceTable)
    .innerJoin(trainingSessionsTable, eq(attendanceTable.sessionId, trainingSessionsTable.id))
    .where(eq(trainingSessionsTable.modality, "jiu"))
    .groupBy(attendanceTable.studentId);

  const thaiMap = new Map(thaiAttendance.map(a => [a.studentId, a.count]));
  const jiuMap = new Map(jiuAttendance.map(a => [a.studentId, a.count]));

  res.json(students.map(s => ({
    id: s.id,
    userId: s.userId,
    name: s.name,
    email: s.email,
    profilePhotoUrl: s.profilePhotoUrl ?? null,
    modalityThai: s.modalityThai,
    modalityJiu: s.modalityJiu,
    thaiGrade: s.thaiGrade ?? null,
    jiuGrade: s.jiuGrade ?? null,
    thaiGradeColor: s.thaiGradeColor ?? null,
    jiuGradeColor: s.jiuGradeColor ?? null,
    hasFaceDescriptor: s.faceDescriptor !== null,
    totalAttendanceThai: thaiMap.get(s.userId) ?? 0,
    totalAttendanceJiu: jiuMap.get(s.userId) ?? 0,
    createdAt: s.createdAt.toISOString(),
  })));
});

router.get("/students/:id", async (req, res): Promise<void> => {
  const params = GetStudentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [student] = await db
    .select({
      id: studentProfilesTable.id,
      userId: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      profilePhotoUrl: usersTable.profilePhotoUrl,
      modalityThai: studentProfilesTable.modalityThai,
      modalityJiu: studentProfilesTable.modalityJiu,
      thaiGrade: studentProfilesTable.thaiGrade,
      jiuGrade: studentProfilesTable.jiuGrade,
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

  const thaiCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(attendanceTable)
    .innerJoin(trainingSessionsTable, eq(attendanceTable.sessionId, trainingSessionsTable.id))
    .where(and(eq(attendanceTable.studentId, student.userId), eq(trainingSessionsTable.modality, "thai")));

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
    profilePhotoUrl: student.profilePhotoUrl ?? null,
    modalityThai: student.modalityThai,
    modalityJiu: student.modalityJiu,
    thaiGrade: student.thaiGrade ?? null,
    jiuGrade: student.jiuGrade ?? null,
    thaiGradeColor: student.thaiGradeColor ?? null,
    jiuGradeColor: student.jiuGradeColor ?? null,
    hasFaceDescriptor: student.faceDescriptor !== null,
    totalAttendanceThai: thaiCount[0]?.count ?? 0,
    totalAttendanceJiu: jiuCount[0]?.count ?? 0,
    createdAt: student.createdAt.toISOString(),
  });
});

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

  const [profile] = await db
    .update(studentProfilesTable)
    .set(body.data)
    .where(eq(studentProfilesTable.userId, params.data.id))
    .returning();

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
    profilePhotoUrl: user.profilePhotoUrl ?? null,
    modalityThai: profile.modalityThai,
    modalityJiu: profile.modalityJiu,
    thaiGrade: profile.thaiGrade ?? null,
    jiuGrade: profile.jiuGrade ?? null,
    thaiGradeColor: profile.thaiGradeColor ?? null,
    jiuGradeColor: profile.jiuGradeColor ?? null,
    hasFaceDescriptor: profile.faceDescriptor !== null,
    totalAttendanceThai: 0,
    totalAttendanceJiu: 0,
    createdAt: user.createdAt.toISOString(),
  });
});

router.post("/students/:id/face-descriptor", async (req, res): Promise<void> => {
  const params = SaveFaceDescriptorParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = SaveFaceDescriptorBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  await db
    .update(studentProfilesTable)
    .set({
      faceDescriptor: body.data.descriptor,
      facePhotoUrl: body.data.photoUrl,
    })
    .where(eq(studentProfilesTable.userId, params.data.id));

  res.json({ message: "Face descriptor saved successfully" });
});

router.post("/face/identify", async (req, res): Promise<void> => {
  const body = IdentifyFaceBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const studentsWithFaces = await db
    .select({
      userId: usersTable.id,
      name: usersTable.name,
      profilePhotoUrl: usersTable.profilePhotoUrl,
      faceDescriptor: studentProfilesTable.faceDescriptor,
    })
    .from(usersTable)
    .innerJoin(studentProfilesTable, eq(usersTable.id, studentProfilesTable.userId))
    .where(sql`${studentProfilesTable.faceDescriptor} IS NOT NULL`);

  const THRESHOLD = 0.5;
  const matches: {
    studentId: number;
    name: string;
    profilePhotoUrl: string | null;
    distance: number;
    matched: boolean;
  }[] = [];

  for (const queryDescriptor of body.data.descriptors) {
    let bestMatch = { studentId: -1, name: "", profilePhotoUrl: null as string | null, distance: Infinity, matched: false };

    for (const student of studentsWithFaces) {
      const stored = student.faceDescriptor as number[];
      if (!Array.isArray(stored) || stored.length !== queryDescriptor.length) continue;

      let sum = 0;
      for (let i = 0; i < stored.length; i++) {
        const diff = stored[i] - queryDescriptor[i];
        sum += diff * diff;
      }
      const distance = Math.sqrt(sum);

      if (distance < bestMatch.distance) {
        bestMatch = {
          studentId: student.userId,
          name: student.name,
          profilePhotoUrl: student.profilePhotoUrl ?? null,
          distance,
          matched: distance <= THRESHOLD,
        };
      }
    }

    if (bestMatch.studentId !== -1) {
      matches.push(bestMatch);
    }
  }

  res.json(matches);
});

export default router;
