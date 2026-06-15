import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inArray, eq } from "drizzle-orm";
import {
  db,
  pool,
  usersTable,
  trainingSessionsTable,
  attendanceTable,
} from "@workspace/db";
import {
  registerUser,
  uploadImage,
  setProfilePhoto,
  recognizeTeam,
  bulkAttendance,
  composeGroupPhoto,
  authedFetch,
  type AuthedUser,
} from "./helpers";

const fixturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
);

// Unique suffix so re-runs never collide on the unique email constraint.
const sfx = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

let teacher: AuthedUser;
let thaiStudent: AuthedUser;
let jiuStudent: AuthedUser;
let bothStudent: AuthedUser;
let teamObjectPath: string;
let thaiBuffer: Buffer;

let createdUserIds: number[] = [];

beforeAll(async () => {
  thaiBuffer = await readFile(path.join(fixturesDir, "student-thai.png"));
  const jiuBuffer = await readFile(path.join(fixturesDir, "student-jiu.png"));
  const bothBuffer = await readFile(path.join(fixturesDir, "student-both.png"));

  teacher = await registerUser({
    name: "Mestre Teste",
    email: `mestre.${sfx}@academia.test`,
    role: "teacher",
  });
  thaiStudent = await registerUser({
    name: "Aluno Thai",
    email: `thai.${sfx}@academia.test`,
    role: "student",
    modalityThai: true,
    modalityJiu: false,
  });
  jiuStudent = await registerUser({
    name: "Aluno Jiu",
    email: `jiu.${sfx}@academia.test`,
    role: "student",
    modalityThai: false,
    modalityJiu: true,
  });
  bothStudent = await registerUser({
    name: "Aluno Ambos",
    email: `ambos.${sfx}@academia.test`,
    role: "student",
    modalityThai: true,
    modalityJiu: true,
  });
  createdUserIds = [teacher.id, thaiStudent.id, jiuStudent.id, bothStudent.id];

  // Teacher (a "mestre") registers each student's reference face. The same
  // portrait will appear in the team photo, so recognition must map it back.
  const profileUploads: [AuthedUser, Buffer][] = [
    [thaiStudent, thaiBuffer],
    [jiuStudent, jiuBuffer],
    [bothStudent, bothBuffer],
  ];
  for (const [student, buffer] of profileUploads) {
    const objectPath = await uploadImage(
      teacher.token,
      buffer,
      "image/png",
      `profile-${student.id}.png`,
    );
    const result = await setProfilePhoto(teacher.token, student.id, objectPath);
    expect(
      result.faceDetected,
      `expected a detectable face in the profile photo for ${student.name}`,
    ).toBe(true);
  }

  // The mestre uploads ONE post-training group photo containing all three.
  const groupPhoto = await composeGroupPhoto([thaiBuffer, jiuBuffer, bothBuffer]);
  teamObjectPath = await uploadImage(
    teacher.token,
    groupPhoto,
    "image/png",
    "team.png",
  );
}, 180_000);

afterAll(async () => {
  // Sessions created by the bulk endpoint reference the teacher (no cascade on
  // teacherId), so remove them first; that cascades their attendance rows.
  await db
    .delete(trainingSessionsTable)
    .where(eq(trainingSessionsTable.teacherId, teacher.id));
  // Deleting the users cascades student_profiles and any remaining attendance.
  if (createdUserIds.length > 0) {
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
  await pool.end();
});

describe("team-photo attendance flow (server-side facial recognition)", () => {
  it("recognizes each student in the modalities they train", async () => {
    const result = await recognizeTeam(teacher.token, teamObjectPath);

    expect(result.detectedFaces).toBeGreaterThanOrEqual(3);

    const byId = new Map(result.matches.map((m) => [m.studentId, m]));
    for (const student of [thaiStudent, jiuStudent, bothStudent]) {
      expect(
        byId.has(student.id),
        `expected ${student.name} to be recognized`,
      ).toBe(true);
    }

    // Identity is correct (no cross-matching between the three faces).
    expect(byId.get(thaiStudent.id)!.name).toBe(thaiStudent.name);
    expect(byId.get(jiuStudent.id)!.name).toBe(jiuStudent.name);
    expect(byId.get(bothStudent.id)!.name).toBe(bothStudent.name);

    // Modalities come from each student's registration.
    expect(byId.get(thaiStudent.id)!.modalityThai).toBe(true);
    expect(byId.get(thaiStudent.id)!.modalityJiu).toBe(false);
    expect(byId.get(jiuStudent.id)!.modalityThai).toBe(false);
    expect(byId.get(jiuStudent.id)!.modalityJiu).toBe(true);
    expect(byId.get(bothStudent.id)!.modalityThai).toBe(true);
    expect(byId.get(bothStudent.id)!.modalityJiu).toBe(true);

    // Same pixels in profile + group photo => a very confident match.
    for (const student of [thaiStudent, jiuStudent, bothStudent]) {
      expect(byId.get(student.id)!.distance).toBeLessThan(0.5);
    }
  });

  it("bulk-marks attendance per modality, then dedupes on a second run", async () => {
    const students = [thaiStudent, jiuStudent, bothStudent].map((s) => ({
      studentId: s.id,
      modalities: [] as ("thai" | "jiu")[],
    }));

    // First run: thai(1) + jiu(1) + both(2) = 4 attendance records.
    const first = await bulkAttendance(teacher.token, teacher.id, students);
    expect(first.created).toBe(4);
    expect(first.skipped).toBe(0);

    // Verify attendance landed in the right modalities, derived server-side.
    const rows = await db
      .select({
        studentId: attendanceTable.studentId,
        modality: trainingSessionsTable.modality,
      })
      .from(attendanceTable)
      .innerJoin(
        trainingSessionsTable,
        eq(attendanceTable.sessionId, trainingSessionsTable.id),
      )
      .where(
        inArray(attendanceTable.studentId, [
          thaiStudent.id,
          jiuStudent.id,
          bothStudent.id,
        ]),
      );

    const modalitiesByStudent = new Map<number, Set<string>>();
    for (const row of rows) {
      if (!modalitiesByStudent.has(row.studentId)) {
        modalitiesByStudent.set(row.studentId, new Set());
      }
      modalitiesByStudent.get(row.studentId)!.add(row.modality);
    }

    expect([...modalitiesByStudent.get(thaiStudent.id)!].sort()).toEqual([
      "thai",
    ]);
    expect([...modalitiesByStudent.get(jiuStudent.id)!].sort()).toEqual(["jiu"]);
    expect([...modalitiesByStudent.get(bothStudent.id)!].sort()).toEqual([
      "jiu",
      "thai",
    ]);

    // Sessions were created for both modalities today.
    const modalitiesSeen = new Set(rows.map((r) => r.modality));
    expect(modalitiesSeen.has("thai")).toBe(true);
    expect(modalitiesSeen.has("jiu")).toBe(true);

    // Second run: everything already exists, so nothing new is created.
    const second = await bulkAttendance(teacher.token, teacher.id, students);
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(4);
  });

  describe("authorization", () => {
    it("forbids a student from recognizing the team", async () => {
      const res = await authedFetch(
        thaiStudent.token,
        "/api/face/recognize-team",
        { method: "POST", body: { objectPath: teamObjectPath } },
      );
      expect(res.status).toBe(403);
    });

    it("forbids a student from bulk-marking attendance", async () => {
      const res = await authedFetch(thaiStudent.token, "/api/attendance/bulk", {
        method: "POST",
        body: {
          teacherId: thaiStudent.id,
          students: [{ studentId: thaiStudent.id, modalities: ["thai"] }],
        },
      });
      expect(res.status).toBe(403);
    });

    it("forbids a student from overwriting another user's profile photo", async () => {
      const res = await authedFetch(
        thaiStudent.token,
        "/api/face/profile-photo",
        {
          method: "POST",
          body: { userId: jiuStudent.id, objectPath: "/objects/uploads/fake" },
        },
      );
      expect(res.status).toBe(403);
    });
  });
});
