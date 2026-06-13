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

type Unit = "matriz" | "panobianco" | "upfitness";

const router: IRouter = Router();

router.get("/students", async (req, res): Promise<void> => {
  const query = ListStudentsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  // Determine requester role — students only see their own unit
  const requesterId = (req.session as unknown as Record<string, unknown>).userId as number | undefined;
  let requesterUnit: Unit | null = null;
  let requesterRole: string | null = null;
  if (requesterId) {
    const [requester] = await db.select({ role: usersTable.role, unit: usersTable.unit }).from(usersTable).where(eq(usersTable.id, requesterId));
    requesterRole = requester?.role ?? null;
    requesterUnit = (requester?.unit ?? null) as Unit | null;
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

  // Students auto-filtered to their unit; teachers/admins use optional query param
  if (requesterRole === "student" && requesterUnit) {
    conditions.push(eq(usersTable.unit, requesterUnit));
  } else if (query.data.unit) {
    conditions.push(eq(usersTable.unit, query.data.unit as Unit));
  }

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

  if (query.data.search) {
    const search = `%${query.data.search}%`;
    joinQuery = joinQuery.where(or(ilike(usersTable.name, search), ilike(usersTable.email, search)));
  }

  const students = await joinQuery;

  // Saturday Thai sessions count double
  const thaiAttendance = await db
    .select({
      studentId: attendanceTable.studentId,
      count: sql<number>`SUM(CASE WHEN EXTRACT(DOW FROM ${trainingSessionsTable.sessionDate}) = 6 THEN 2 ELSE 1 END)::int`,
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

  // Saturday Thai sessions count double
  const thaiCount = await db
    .select({
      count: sql<number>`SUM(CASE WHEN EXTRACT(DOW FROM ${trainingSessionsTable.sessionDate}) = 6 THEN 2 ELSE 1 END)::int`,
    })
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

  // Lookup requester's role from session
  const requesterId = (req.session as unknown as Record<string, unknown>).userId as number | undefined;
  const requesterIsStudent = requesterId
    ? (await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, requesterId)))[0]?.role === "student"
    : false;

  // Students cannot change grade fields — strip them from the update
  const GRADE_FIELDS = ["thaiGrade", "thaiGradeColor", "jiuGrade", "jiuGradeColor", "jiuDegree"] as const;
  const updateData = requesterIsStudent
    ? Object.fromEntries(Object.entries(body.data).filter(([k]) => !GRADE_FIELDS.includes(k as typeof GRADE_FIELDS[number])))
    : body.data;

  // If nothing left to update (student sent only grade fields), just return current data
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
