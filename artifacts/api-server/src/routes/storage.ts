// =============================================================================
// routes/storage.ts — Upload e leitura de arquivos no Object Storage.
// Fluxo: o cliente pede uma URL pré-assinada (presigned) e envia o arquivo
// direto ao bucket; a leitura passa por esta API, que aplica autenticação e ACL.
// SEGURANÇA (anti-IDOR): objetos privados (fotos de perfil/equipe) só são
// servidos a usuários autenticados e respeitam a política de ACL de cada objeto.
// =============================================================================
import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { getObjectAclPolicy, ObjectPermission } from "../lib/objectAcl";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

// Uploads are images only (profile photos + team photos), capped to keep the
// bucket from being abused via the presigned URL.
const ALLOWED_UPLOAD_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB

// Lê o id do usuário autenticado da sessão (preenchida por cookie ou Bearer).
function sessionUserId(req: Request): number | undefined {
  return (req.session as unknown as Record<string, unknown> | undefined)?.userId as
    | number
    | undefined;
}

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 *
 * Restricted to authenticated users; only image uploads under the size cap are
 * allowed so the presigned URL cannot be abused to dump arbitrary content.
 */
router.post("/storage/uploads/request-url", async (req: Request, res: Response) => {
  // Autorização: somente usuários autenticados podem solicitar URL de upload.
  if (!sessionUserId(req)) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  // Valida os metadados enviados (nome, tamanho, tipo) — o arquivo NÃO vem aqui.
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const { name, size, contentType } = parsed.data;

    // Restringe a imagens permitidas (evita abuso do bucket via presigned URL).
    if (!ALLOWED_UPLOAD_TYPES.has(contentType.toLowerCase())) {
      res.status(400).json({ error: "Tipo de arquivo não permitido (apenas imagens)" });
      return;
    }
    // Limita o tamanho máximo do arquivo.
    if (typeof size === "number" && size > MAX_UPLOAD_BYTES) {
      res.status(400).json({ error: "Arquivo muito grande" });
      return;
    }

    // Gera a URL pré-assinada e normaliza o caminho do objeto para uso interno.
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    // Resolve o caminho do arquivo (curinga) e procura no diretório público.
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    // Faz streaming do conteúdo do objeto público diretamente para a resposta.
    const response = await objectStorageService.downloadObject(file);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * These are served from a separate path from /public-objects and can optionally
 * be protected with authentication or ACL checks based on the use case.
 */
router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  // Private objects (profile photos, team photos) are only served to
  // authenticated users. The web app authenticates via session cookies; the
  // native app sends no cookies, so its image requests carry a Bearer token
  // (see AuthImage on mobile) which bearerAuth decodes into session.userId.
  if (!sessionUserId(req)) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  try {
    // Monta o caminho /objects/... e localiza o objeto privado correspondente.
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    // Per-object ACL: objects assigned a policy are enforced — profile photos are
    // "public" (readable by any authenticated user), team photos are owner-only.
    // Legacy objects predating ACLs have no policy; since the only such objects
    // are profile avatars (intentionally shared) and team photos always receive a
    // private policy at creation, a missing policy falls back to authenticated read.
    // ACL por objeto (anti-IDOR): se há política, verifica se o usuário atual tem
    // permissão de leitura; foto de equipe é privada (somente dono). Sem política,
    // cai no acesso autenticado (somente avatares legados, intencionalmente compartilhados).
    const policy = await getObjectAclPolicy(objectFile);
    if (policy) {
      const allowed = await objectStorageService.canAccessObjectEntity({
        userId: String(sessionUserId(req)),
        objectFile,
        requestedPermission: ObjectPermission.READ,
      });
      // Sem permissão → 403 (impede acesso indevido a arquivo de outro usuário).
      if (!allowed) {
        res.status(403).json({ error: "Sem permissão para acessar este arquivo" });
        return;
      }
    }

    // Autorizado: faz streaming do objeto privado para a resposta.
    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
