import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, usersTable, studentProfilesTable } from "@workspace/db";
import {
  RegisterProfilePhotoBody,
  RecognizeTeamBody,
} from "@workspace/api-zod";
import { ObjectStorageService } from "../lib/objectStorage";
import {
  detectSingleDescriptor,
  detectAllDescriptors,
  euclideanDistance,
} from "../lib/face";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const MATCH_THRESHOLD = 0.5;

function servingUrl(objectPath: string): string {
  return `/api/storage${objectPath}`;
}

function getSessionUserId(req: { session: unknown }): number | undefined {
  return (req.session as Record<string, unknown>).userId as number | undefined;
}

async function getRequester(
  userId: number | undefined,
): Promise<{ id: number; role: string } | null> {
  if (!userId) return null;
  const [user] = await db
    .select({ id: usersTable.id, role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  return user ?? null;
}

async function downloadObjectBytes(objectPath: string): Promise<Buffer> {
  const file = await objectStorageService.getObjectEntityFile(objectPath);
  const [buffer] = await file.download();
  return buffer;
}

/**
 * POST /face/profile-photo
 * Sets a user's profile photo and, for students, computes & stores the
 * reference face descriptor used by team recognition.
 */
router.post("/face/profile-photo", async (req, res): Promise<void> => {
  const body = RegisterProfilePhotoBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const { userId, objectPath } = body.data;

  // Authz: users may set their own photo; teachers/admins may set anyone's.
  const requester = await getRequester(getSessionUserId(req));
  if (!requester) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  const isMaster = requester.role === "teacher" || requester.role === "admin";
  if (!isMaster && requester.id !== userId) {
    res.status(403).json({ error: "Sem permissão para alterar a foto deste usuário" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ error: "Usuário não encontrado" });
    return;
  }

  const photoUrl = servingUrl(objectPath);

  let descriptor: number[] | null = null;
  try {
    const bytes = await downloadObjectBytes(objectPath);
    descriptor = await detectSingleDescriptor(bytes);
  } catch (error) {
    req.log.error({ err: error }, "Falha ao processar foto de perfil");
    res.status(400).json({ error: "Não foi possível processar a imagem enviada" });
    return;
  }

  // Always save the photo as the user's avatar.
  await db.update(usersTable).set({ profilePhotoUrl: photoUrl }).where(eq(usersTable.id, userId));

  // For students, persist the descriptor (or clear it if no face was found).
  const [profile] = await db
    .select({ id: studentProfilesTable.id })
    .from(studentProfilesTable)
    .where(eq(studentProfilesTable.userId, userId));

  if (profile) {
    await db
      .update(studentProfilesTable)
      .set({
        faceDescriptor: descriptor ?? null,
        facePhotoUrl: descriptor ? photoUrl : null,
      })
      .where(eq(studentProfilesTable.userId, userId));
  }

  const faceDetected = descriptor !== null;
  res.json({
    faceDetected,
    profilePhotoUrl: photoUrl,
    message: faceDetected
      ? "Foto de perfil salva e rosto cadastrado com sucesso."
      : "Foto salva, mas nenhum rosto foi detectado. O reconhecimento automático não funcionará até enviar uma foto nítida do rosto.",
  });
});

/**
 * POST /face/recognize-team
 * Detects every face in a whole-team photo and matches each against the
 * stored student reference descriptors. Returns matched students with the
 * modalities they train so attendance can be marked in all of them.
 */
router.post("/face/recognize-team", async (req, res): Promise<void> => {
  // Authz: team recognition is restricted to teachers/admins.
  const requester = await getRequester(getSessionUserId(req));
  if (!requester) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  if (requester.role !== "teacher" && requester.role !== "admin") {
    res.status(403).json({ error: "Apenas professores podem reconhecer a equipe" });
    return;
  }

  const body = RecognizeTeamBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const { objectPath } = body.data;

  let descriptors: number[][];
  try {
    const bytes = await downloadObjectBytes(objectPath);
    descriptors = await detectAllDescriptors(bytes);
  } catch (error) {
    req.log.error({ err: error }, "Falha ao processar foto da equipe");
    res.status(400).json({ error: "Não foi possível processar a imagem enviada" });
    return;
  }

  const studentsWithFaces = await db
    .select({
      userId: usersTable.id,
      name: usersTable.name,
      profilePhotoUrl: usersTable.profilePhotoUrl,
      modalityThai: studentProfilesTable.modalityThai,
      modalityJiu: studentProfilesTable.modalityJiu,
      faceDescriptor: studentProfilesTable.faceDescriptor,
    })
    .from(usersTable)
    .innerJoin(studentProfilesTable, eq(usersTable.id, studentProfilesTable.userId))
    .where(sql`${studentProfilesTable.faceDescriptor} IS NOT NULL`);

  const photoUrl = servingUrl(objectPath);
  const matchedByUser = new Map<number, {
    studentId: number;
    name: string;
    profilePhotoUrl: string | null;
    distance: number;
    modalityThai: boolean;
    modalityJiu: boolean;
  }>();
  let unmatchedCount = 0;

  for (const detected of descriptors) {
    let best: { student: typeof studentsWithFaces[number]; distance: number } | null = null;

    for (const student of studentsWithFaces) {
      const stored = student.faceDescriptor as number[];
      if (!Array.isArray(stored) || stored.length !== detected.length) continue;
      const distance = euclideanDistance(stored, detected);
      if (best === null || distance < best.distance) {
        best = { student, distance };
      }
    }

    if (best && best.distance <= MATCH_THRESHOLD) {
      const existing = matchedByUser.get(best.student.userId);
      if (!existing || best.distance < existing.distance) {
        matchedByUser.set(best.student.userId, {
          studentId: best.student.userId,
          name: best.student.name,
          profilePhotoUrl: best.student.profilePhotoUrl ?? null,
          distance: best.distance,
          modalityThai: best.student.modalityThai,
          modalityJiu: best.student.modalityJiu,
        });
      }
    } else {
      unmatchedCount += 1;
    }
  }

  const matches = Array.from(matchedByUser.values()).sort((a, b) => a.distance - b.distance);

  res.json({
    detectedFaces: descriptors.length,
    matchedCount: matches.length,
    unmatchedCount,
    photoUrl,
    matches,
  });
});

export default router;
