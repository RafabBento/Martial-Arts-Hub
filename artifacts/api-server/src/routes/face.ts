// =============================================================================
// routes/face.ts — Reconhecimento facial (cadastro e identificação em equipe).
// Três fluxos: (1) foto de perfil que também gera o descritor de referência;
// (2) cadastro multiângulo (vários descritores por aluno); (3) reconhecimento
// da foto da equipe, casando cada rosto com os descritores cadastrados para
// marcar presença. Descritores são vetores de 128 floats; a comparação usa
// distância euclidiana contra um limiar (threshold).
// SEGURANÇA: várias proteções anti-IDOR garantem que um objeto enviado só pode
// ser reivindicado/processado pelo dono; reconhecimento de equipe é só mestre.
// =============================================================================
import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, studentProfilesTable, studentFaceDescriptorsTable } from "@workspace/db";
import {
  RegisterProfilePhotoBody,
  RecognizeTeamBody,
  EnrollFaceBody,
} from "@workspace/api-zod";
import { ObjectStorageService } from "../lib/objectStorage";
import { getObjectAclPolicy } from "../lib/objectAcl";
import {
  detectSingleDescriptor,
  detectAllDescriptors,
  euclideanDistance,
} from "../lib/face";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

// Strict by default: a detected face matches a student only when its descriptor
// is within this euclidean distance. Lower = fewer false positives (safer);
// override with FACE_MATCH_THRESHOLD if needed.
// (Limiar de correspondência: um rosto só casa se a distância for <= este valor.
// Menor = menos falsos positivos. Pode ser ajustado por FACE_MATCH_THRESHOLD.)
const MATCH_THRESHOLD = (() => {
  const raw = process.env["FACE_MATCH_THRESHOLD"];
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) ? n : 0.5;
})();

// Converte um caminho de objeto na URL servida pela API (rota /api/storage).
function servingUrl(objectPath: string): string {
  return `/api/storage${objectPath}`;
}

// Lê o id do usuário autenticado a partir da sessão.
function getSessionUserId(req: { session: unknown }): number | undefined {
  return (req.session as Record<string, unknown>).userId as number | undefined;
}

// Busca o solicitante (id + role) no banco; usado para checagens de autorização.
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

// Baixa os bytes de um objeto do storage para processamento facial.
async function downloadObjectBytes(objectPath: string): Promise<Buffer> {
  const file = await objectStorageService.getObjectEntityFile(objectPath);
  const [buffer] = await file.download();
  return buffer;
}

/**
 * Guards against IDOR via a client-supplied objectPath: an uploaded object can
 * only be claimed/processed by the user who owns it. Freshly uploaded objects
 * have no ACL policy yet (returns true); an object already owned by someone else
 * is rejected. Throws ObjectNotFoundError if the path does not exist.
 */
async function isObjectOwnableBy(objectPath: string, ownerId: number): Promise<boolean> {
  const file = await objectStorageService.getObjectEntityFile(objectPath);
  const existing = await getObjectAclPolicy(file);
  return !existing || existing.owner === String(ownerId);
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

  // IDOR guard: cannot claim an object already owned by another user.
  try {
    if (!(await isObjectOwnableBy(objectPath, userId))) {
      res.status(403).json({ error: "Este arquivo não pertence a este usuário" });
      return;
    }
  } catch (error) {
    req.log.warn({ err: error }, "Foto de perfil: objeto não encontrado");
    res.status(400).json({ error: "Imagem enviada não encontrada" });
    return;
  }

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

  // Persist the reference descriptor on the user's training profile (or clear
  // it if no face was found). Students always have a profile; teachers may not
  // yet — create one (defaulting to both modalities) so they can be recognized
  // in team photos and appear in the rankings too.
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
  } else if (user.role === "student" || user.role === "teacher") {
    await db.insert(studentProfilesTable).values({
      userId,
      modalityThai: true,
      modalityJiu: true,
      faceDescriptor: descriptor ?? null,
      facePhotoUrl: descriptor ? photoUrl : null,
    });
  }

  // Lock the object to the target user. Profile photos are intentionally
  // visible to ALL authenticated users (rankings, student lists, dashboard),
  // so visibility is "public" — the serving route still requires a session.
  try {
    await objectStorageService.trySetObjectEntityAclPolicy(objectPath, {
      owner: String(userId),
      visibility: "public",
    });
  } catch (error) {
    req.log.warn({ err: error }, "Não foi possível definir a ACL da foto de perfil");
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

// Two stored angles closer than this euclidean distance are considered the
// same pose and deduplicated, so a burst of near-identical frames does not
// bloat the descriptor set. Override with FACE_ENROLL_DEDUPE if needed.
const ENROLL_DEDUPE = (() => {
  const raw = process.env["FACE_ENROLL_DEDUPE"];
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) ? n : 0.35;
})();

// Cap on how many distinct angles we keep per student.
const ENROLL_MAX_ANGLES = (() => {
  const raw = process.env["FACE_ENROLL_MAX_ANGLES"];
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 12;
})();

/**
 * POST /face/enroll
 * Multi-angle face enrollment. Accepts a burst of still frames (front/left/
 * right/up/down), detects the best face per frame, deduplicates near-identical
 * angles, and replaces the student's stored multi-angle descriptor set.
 */
router.post("/face/enroll", async (req, res): Promise<void> => {
  const body = EnrollFaceBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const { userId, objectPaths } = body.data;

  // Authz: users may enroll their own face; teachers/admins may enroll anyone's.
  const requester = await getRequester(getSessionUserId(req));
  if (!requester) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  const isMaster = requester.role === "teacher" || requester.role === "admin";
  if (!isMaster && requester.id !== userId) {
    res.status(403).json({ error: "Sem permissão para cadastrar o rosto deste usuário" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ error: "Usuário não encontrado" });
    return;
  }

  // Detect the best face per frame. Frames without a face are rejected.
  const descriptors: number[][] = [];
  let framesAccepted = 0;
  let framesRejected = 0;
  let firstAcceptedPath: string | null = null;

  for (const objectPath of objectPaths) {
    // IDOR guard: skip any object that already belongs to someone else.
    try {
      if (!(await isObjectOwnableBy(objectPath, userId))) {
        framesRejected += 1;
        continue;
      }
    } catch (error) {
      req.log.warn({ err: error }, "Cadastro facial: quadro não encontrado");
      framesRejected += 1;
      continue;
    }

    let descriptor: number[] | null = null;
    try {
      const bytes = await downloadObjectBytes(objectPath);
      descriptor = await detectSingleDescriptor(bytes);
    } catch (error) {
      req.log.warn({ err: error }, "Cadastro facial: falha ao processar quadro");
    }

    if (!descriptor) {
      framesRejected += 1;
      continue;
    }

    framesAccepted += 1;
    if (!firstAcceptedPath) firstAcceptedPath = objectPath;

    // Dedupe: drop angles too close to one we already kept.
    const isDuplicate = descriptors.some((d) => euclideanDistance(d, descriptor!) < ENROLL_DEDUPE);
    if (!isDuplicate && descriptors.length < ENROLL_MAX_ANGLES) {
      descriptors.push(descriptor);
    }

    // Lock each accepted frame to the user (public, like profile photos).
    try {
      await objectStorageService.trySetObjectEntityAclPolicy(objectPath, {
        owner: String(userId),
        visibility: "public",
      });
    } catch (error) {
      req.log.warn({ err: error }, "Não foi possível definir a ACL do quadro de cadastro");
    }
  }

  if (descriptors.length === 0) {
    res.json({
      anglesStored: 0,
      framesAccepted,
      framesRejected,
      profilePhotoUrl: user.profilePhotoUrl ?? null,
      message:
        "Nenhum rosto foi detectado nos quadros enviados. Refaça o cadastro com boa iluminação e o rosto bem visível.",
    });
    return;
  }

  // Ensure the user has a training profile so they can be recognized/ranked.
  const [profile] = await db
    .select({ id: studentProfilesTable.id })
    .from(studentProfilesTable)
    .where(eq(studentProfilesTable.userId, userId));
  if (!profile && (user.role === "student" || user.role === "teacher")) {
    await db.insert(studentProfilesTable).values({
      userId,
      modalityThai: true,
      modalityJiu: true,
    });
  }

  // Set a profile photo from the first good frame when the user has none yet.
  let profilePhotoUrl = user.profilePhotoUrl ?? null;
  const setProfilePhoto = !profilePhotoUrl && !!firstAcceptedPath;
  if (setProfilePhoto) {
    profilePhotoUrl = servingUrl(firstAcceptedPath!);
  }

  // Replace the student's previous multi-angle set with the new one atomically:
  // a failed insert must never leave the student with an emptied descriptor set.
  await db.transaction(async (tx) => {
    await tx.delete(studentFaceDescriptorsTable).where(eq(studentFaceDescriptorsTable.userId, userId));
    await tx.insert(studentFaceDescriptorsTable).values(
      descriptors.map((descriptor) => ({ userId, descriptor })),
    );

    if (setProfilePhoto) {
      await tx.update(usersTable).set({ profilePhotoUrl }).where(eq(usersTable.id, userId));
      await tx
        .update(studentProfilesTable)
        .set({ facePhotoUrl: profilePhotoUrl })
        .where(eq(studentProfilesTable.userId, userId));
    }
  });

  res.json({
    anglesStored: descriptors.length,
    framesAccepted,
    framesRejected,
    profilePhotoUrl,
    message: `Cadastro concluído — ${descriptors.length} ${descriptors.length === 1 ? "ângulo capturado" : "ângulos capturados"}.`,
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

  // IDOR guard: cannot process an object already owned by another user.
  try {
    if (!(await isObjectOwnableBy(objectPath, requester.id))) {
      res.status(403).json({ error: "Este arquivo não pertence a este usuário" });
      return;
    }
  } catch (error) {
    req.log.warn({ err: error }, "Foto da equipe: objeto não encontrado");
    res.status(400).json({ error: "Imagem enviada não encontrada" });
    return;
  }

  let descriptors: number[][];
  try {
    const bytes = await downloadObjectBytes(objectPath);
    descriptors = await detectAllDescriptors(bytes);
  } catch (error) {
    req.log.error({ err: error }, "Falha ao processar foto da equipe");
    res.status(400).json({ error: "Não foi possível processar a imagem enviada" });
    return;
  }

  // Team photos contain sensitive group images and are NOT shown back to other
  // users — lock to the uploading mestre (private, owner-only).
  try {
    await objectStorageService.trySetObjectEntityAclPolicy(objectPath, {
      owner: String(requester.id),
      visibility: "private",
    });
  } catch (error) {
    req.log.warn({ err: error }, "Não foi possível definir a ACL da foto da equipe");
  }

  const profileRows = await db
    .select({
      userId: usersTable.id,
      name: usersTable.name,
      profilePhotoUrl: usersTable.profilePhotoUrl,
      modalityThai: studentProfilesTable.modalityThai,
      modalityJiu: studentProfilesTable.modalityJiu,
      faceDescriptor: studentProfilesTable.faceDescriptor,
    })
    .from(usersTable)
    .innerJoin(studentProfilesTable, eq(usersTable.id, studentProfilesTable.userId));

  // Load every stored multi-angle descriptor and group them by student.
  const angleRows = await db
    .select({
      userId: studentFaceDescriptorsTable.userId,
      descriptor: studentFaceDescriptorsTable.descriptor,
    })
    .from(studentFaceDescriptorsTable);
  const anglesByUser = new Map<number, number[][]>();
  for (const row of angleRows) {
    const d = row.descriptor as number[];
    if (!Array.isArray(d)) continue;
    const list = anglesByUser.get(row.userId) ?? [];
    list.push(d);
    anglesByUser.set(row.userId, list);
  }

  // A candidate carries ALL of a student's reference descriptors: the legacy
  // single one (until they re-enroll) plus every multi-angle one.
  type Candidate = {
    userId: number;
    name: string;
    profilePhotoUrl: string | null;
    modalityThai: boolean;
    modalityJiu: boolean;
    descriptors: number[][];
  };
  const studentsWithFaces: Candidate[] = [];
  for (const row of profileRows) {
    const descriptorSet: number[][] = [];
    const legacy = row.faceDescriptor as number[] | null;
    if (Array.isArray(legacy)) descriptorSet.push(legacy);
    descriptorSet.push(...(anglesByUser.get(row.userId) ?? []));
    if (descriptorSet.length === 0) continue;
    studentsWithFaces.push({
      userId: row.userId,
      name: row.name,
      profilePhotoUrl: row.profilePhotoUrl,
      modalityThai: row.modalityThai,
      modalityJiu: row.modalityJiu,
      descriptors: descriptorSet,
    });
  }

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
  const diag: { best: string; distance: number; matched: boolean }[] = [];

  for (const detected of descriptors) {
    let best: { student: typeof studentsWithFaces[number]; distance: number } | null = null;

    for (const student of studentsWithFaces) {
      // Best (closest) angle for this student wins.
      let studentBest = Infinity;
      for (const stored of student.descriptors) {
        if (stored.length !== detected.length) continue;
        const distance = euclideanDistance(stored, detected);
        if (distance < studentBest) studentBest = distance;
      }
      if (studentBest === Infinity) continue;
      if (best === null || studentBest < best.distance) {
        best = { student, distance: studentBest };
      }
    }

    diag.push({
      best: best ? best.student.name : "(nenhum candidato)",
      distance: best ? Number(best.distance.toFixed(3)) : -1,
      matched: !!best && best.distance <= MATCH_THRESHOLD,
    });

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

  req.log.info(
    {
      detectedFaces: descriptors.length,
      enrolledCandidates: studentsWithFaces.length,
      matchThreshold: MATCH_THRESHOLD,
      matchedCount: matches.length,
      perFace: diag,
    },
    "recognize-team: resultado do reconhecimento",
  );

  res.json({
    detectedFaces: descriptors.length,
    matchedCount: matches.length,
    unmatchedCount,
    photoUrl,
    matches,
  });
});

export default router;
