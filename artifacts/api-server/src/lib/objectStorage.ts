// Armazenamento de objetos em disco local (fotos de perfil, cadastro facial e
// fotos de equipe). Substitui o Object Storage do Replit (que dependia de um
// sidecar só disponível lá) por arquivos no disco da própria VPS — suficiente
// para uma academia, sem depender de conta/serviço externo.
import { randomUUID, createHmac, timingSafeEqual } from "crypto";
import { createReadStream, existsSync } from "fs";
import { mkdir, readFile, writeFile, stat } from "fs/promises";
import { Readable } from "stream";
import path from "path";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
  type StorageFile,
} from "./objectAcl";

// Raiz de armazenamento no disco. Fica fora de `dist/` (que é apagado a cada
// build) e é ignorada pelo git — ver .gitignore.
const STORAGE_ROOT = path.resolve(process.env["STORAGE_DIR"] ?? path.join(process.cwd(), "storage"));
const PRIVATE_DIR = process.env["PRIVATE_OBJECT_DIR"] ?? "private";
const PUBLIC_DIRS = (process.env["PUBLIC_OBJECT_SEARCH_PATHS"] ?? "public")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);

// Assina/valida URLs de upload de curta duração (substitui a presigned URL do
// GCS). Reaproveita SESSION_SECRET para não exigir mais uma variável de
// ambiente só pra isso.
const UPLOAD_SECRET = process.env["SESSION_SECRET"] ?? "academia_fight_club_secret_2024";
const UPLOAD_TTL_MS = 15 * 60 * 1000; // 15 minutos

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

function metaPath(absPath: string): string {
  return `${absPath}.meta.json`;
}

interface StoredMeta {
  contentType?: string;
  metadata?: Record<string, string>;
}

async function readMeta(absPath: string): Promise<StoredMeta> {
  try {
    const raw = await readFile(metaPath(absPath), "utf8");
    return JSON.parse(raw) as StoredMeta;
  } catch {
    return {};
  }
}

async function writeMeta(absPath: string, meta: StoredMeta): Promise<void> {
  await mkdir(path.dirname(absPath), { recursive: true });
  await writeFile(metaPath(absPath), JSON.stringify(meta), "utf8");
}

// Implementação de arquivo local que expõe só o subconjunto de métodos que o
// resto do app usa (era antes um `File` do @google-cloud/storage) — troca o
// backend sem mexer na lógica de ACL/reconhecimento facial que consome isso.
class LocalFile implements StorageFile {
  constructor(
    public readonly name: string, // caminho relativo (ex.: "private/uploads/<uuid>")
    private readonly absPath: string,
  ) {}

  async exists(): Promise<[boolean]> {
    return [existsSync(this.absPath)];
  }

  async getMetadata(): Promise<[{ contentType?: string; size?: number; metadata?: Record<string, string> }]> {
    const meta = await readMeta(this.absPath);
    let size: number | undefined;
    try {
      size = (await stat(this.absPath)).size;
    } catch {
      size = undefined;
    }
    return [{ contentType: meta.contentType, size, metadata: meta.metadata }];
  }

  async setMetadata(opts: { metadata: Record<string, string> }): Promise<void> {
    const current = await readMeta(this.absPath);
    await writeMeta(this.absPath, { ...current, metadata: { ...current.metadata, ...opts.metadata } });
  }

  createReadStream(): NodeJS.ReadableStream {
    return createReadStream(this.absPath);
  }

  async download(): Promise<[Buffer]> {
    return [await readFile(this.absPath)];
  }

  async write(bytes: Buffer, contentType: string): Promise<void> {
    await mkdir(path.dirname(this.absPath), { recursive: true });
    await writeFile(this.absPath, bytes);
    await writeMeta(this.absPath, { contentType });
  }
}

function fileAt(relativePath: string): LocalFile {
  return new LocalFile(relativePath, path.join(STORAGE_ROOT, relativePath));
}

function sign(objectName: string, expires: number): string {
  return createHmac("sha256", UPLOAD_SECRET).update(`${objectName}:${expires}`).digest("hex");
}

export function verifyUploadToken(objectName: string, expires: number, token: string): boolean {
  if (!Number.isFinite(expires) || Date.now() > expires) return false;
  const expected = sign(objectName, expires);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(token, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export class ObjectStorageService {
  constructor() {}

  getPublicObjectSearchPaths(): Array<string> {
    return PUBLIC_DIRS;
  }

  getPrivateObjectDir(): string {
    return PRIVATE_DIR;
  }

  async searchPublicObject(filePath: string): Promise<LocalFile | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const file = fileAt(`${searchPath}/${filePath}`);
      const [exists] = await file.exists();
      if (exists) return file;
    }
    return null;
  }

  async downloadObject(file: LocalFile, cacheTtlSec: number = 3600): Promise<Response> {
    const [metadata] = await file.getMetadata();
    const aclPolicy = await getObjectAclPolicy(file);
    const isPublic = aclPolicy?.visibility === "public";

    const nodeStream = file.createReadStream();
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    const headers: Record<string, string> = {
      "Content-Type": metadata.contentType || "application/octet-stream",
      "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
    };
    if (metadata.size) {
      headers["Content-Length"] = String(metadata.size);
    }

    return new Response(webStream, { headers });
  }

  /**
   * Gera uma URL de upload de curta duração apontando para a própria API
   * (`baseUrl` é o protocolo+host da requisição atual, montado pelo route
   * handler) — equivalente local à presigned URL do GCS.
   */
  async getObjectEntityUploadURL(baseUrl: string): Promise<string> {
    const objectId = randomUUID();
    const expires = Date.now() + UPLOAD_TTL_MS;
    const objectName = `${PRIVATE_DIR}/uploads/${objectId}`;
    const token = sign(objectName, expires);
    return `${baseUrl}/api/storage/objects/uploads/${objectId}?token=${token}&expires=${expires}`;
  }

  async getObjectEntityFile(objectPath: string): Promise<LocalFile> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join("/");
    const file = fileAt(`${PRIVATE_DIR}/${entityId}`);
    const [exists] = await file.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return file;
  }

  /** Grava os bytes enviados via PUT na URL de upload assinada. */
  async writeUploadedObject(objectId: string, bytes: Buffer, contentType: string): Promise<void> {
    const file = fileAt(`${PRIVATE_DIR}/uploads/${objectId}`);
    await file.write(bytes, contentType);
  }

  normalizeObjectEntityPath(rawPath: string): string {
    try {
      const url = new URL(rawPath);
      const match = url.pathname.match(/\/storage\/objects\/uploads\/([^/?]+)/);
      if (match) return `/objects/uploads/${match[1]}`;
    } catch {
      // não era uma URL absoluta — trata como já normalizado abaixo.
    }
    return rawPath;
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy,
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }

    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: StorageFile;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}
