// Helper de upload de imagens para o object storage usando URL pré-assinada.
// Fluxo em duas etapas: (1) pede ao backend uma uploadURL presigned + o caminho
// normalizado do objeto; (2) faz o PUT do arquivo direto no storage. Retorna o
// objectPath usado depois pelos endpoints de reconhecimento facial (que rodam
// 100% no servidor).
import { requestUploadUrl } from "@workspace/api-client-react";

/**
 * Uploads an image to object storage via a presigned URL and returns the
 * normalized object path (e.g. `/objects/uploads/<uuid>`) for use with the
 * face endpoints. All face recognition runs 100% server-side.
 */
export async function uploadImageToStorage(file: File): Promise<string> {
  // Tipo do conteúdo (cai para JPEG se o arquivo não informar).
  const contentType = file.type || "image/jpeg";
  // Etapa 1: solicita ao backend a URL presigned e o caminho do objeto.
  const res = await requestUploadUrl({
    name: file.name || "upload.jpg",
    size: file.size || 1,
    contentType,
  });
  // Etapa 2: envia o arquivo direto ao storage via PUT na URL presigned.
  const putResp = await fetch(res.uploadURL, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: file,
  });
  // Falha no upload propaga erro para o chamador tratar.
  if (!putResp.ok) throw new Error("Falha ao enviar a imagem");
  // Retorna o caminho normalizado do objeto (não a URL presigned).
  return res.objectPath;
}
