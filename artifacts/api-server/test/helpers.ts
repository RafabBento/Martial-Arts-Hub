import { createCanvas, loadImage } from "@napi-rs/canvas";
import { BASE_URL } from "./config";

export interface AuthedUser {
  id: number;
  email: string;
  name: string;
  role: string;
  token: string;
}

export interface RegisterInput {
  name: string;
  email: string;
  password?: string;
  role: "student" | "teacher";
  modalityThai?: boolean;
  modalityJiu?: boolean;
}

async function expectOk(res: Response, what: string): Promise<unknown> {
  if (!res.ok) {
    throw new Error(`${what} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/** JSON fetch with optional Bearer auth. Returns the raw Response. */
export async function authedFetch(
  token: string | undefined,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<Response> {
  const headers: Record<string, string> = {};
  let body: string | undefined;
  if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.body);
  }
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetch(`${BASE_URL}${path}`, { method: init.method ?? "GET", headers, body });
}

export async function registerUser(input: RegisterInput): Promise<AuthedUser> {
  const res = await authedFetch(undefined, "/api/auth/register", {
    method: "POST",
    body: {
      name: input.name,
      email: input.email,
      password: input.password ?? "senha123",
      role: input.role,
      unit: "matriz",
      modalityThai: input.modalityThai ?? false,
      modalityJiu: input.modalityJiu ?? false,
    },
  });
  const data = (await expectOk(res, "register")) as {
    user: { id: number; email: string; name: string; role: string };
    token: string;
  };
  return {
    id: data.user.id,
    email: data.user.email,
    name: data.user.name,
    role: data.user.role,
    token: data.token,
  };
}

/**
 * Uploads an image buffer the same way the real clients do: request a presigned
 * URL, PUT the bytes directly to storage, then return the normalized objectPath
 * the face endpoints expect.
 */
export async function uploadImage(
  token: string,
  buffer: Buffer,
  contentType: string,
  name: string,
): Promise<string> {
  const res = await authedFetch(token, "/api/storage/uploads/request-url", {
    method: "POST",
    body: { name, size: buffer.length, contentType },
  });
  const { uploadURL, objectPath } = (await expectOk(res, "request-url")) as {
    uploadURL: string;
    objectPath: string;
  };

  const put = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: buffer,
  });
  if (!put.ok) {
    throw new Error(`upload PUT failed: ${put.status} ${await put.text()}`);
  }
  return objectPath;
}

export interface ProfilePhotoResult {
  faceDetected: boolean;
  profilePhotoUrl: string;
  message: string;
}

export async function setProfilePhoto(
  token: string,
  userId: number,
  objectPath: string,
): Promise<ProfilePhotoResult> {
  const res = await authedFetch(token, "/api/face/profile-photo", {
    method: "POST",
    body: { userId, objectPath },
  });
  return (await expectOk(res, "profile-photo")) as ProfilePhotoResult;
}

export interface TeamMatch {
  studentId: number;
  name: string;
  profilePhotoUrl: string | null;
  distance: number;
  modalityThai: boolean;
  modalityJiu: boolean;
}

export interface RecognizeTeamResult {
  detectedFaces: number;
  matchedCount: number;
  unmatchedCount: number;
  photoUrl: string;
  matches: TeamMatch[];
}

export async function recognizeTeam(
  token: string,
  objectPath: string,
): Promise<RecognizeTeamResult> {
  const res = await authedFetch(token, "/api/face/recognize-team", {
    method: "POST",
    body: { objectPath },
  });
  return (await expectOk(res, "recognize-team")) as RecognizeTeamResult;
}

export interface BulkResult {
  created: number;
  skipped: number;
}

export async function bulkAttendance(
  token: string,
  teacherId: number,
  students: { studentId: number; modalities: ("thai" | "jiu")[] }[],
  photoUrl?: string,
): Promise<BulkResult> {
  const res = await authedFetch(token, "/api/attendance/bulk", {
    method: "POST",
    body: { teacherId, photoUrl, students },
  });
  return (await expectOk(res, "attendance/bulk")) as BulkResult;
}

/**
 * Builds a single "team photo" by laying the individual face portraits out
 * side-by-side on a plain background. The recognizer detects each face and
 * matches it back to the student whose profile photo used the same portrait.
 */
export async function composeGroupPhoto(buffers: Buffer[]): Promise<Buffer> {
  const faceSize = 500;
  const pad = 80;
  const width = pad + buffers.length * (faceSize + pad);
  const height = pad * 2 + faceSize;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f0f0f0";
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < buffers.length; i++) {
    const img = await loadImage(buffers[i]);
    const x = pad + i * (faceSize + pad);
    ctx.drawImage(img, x, pad, faceSize, faceSize);
  }

  return canvas.encode("png");
}
