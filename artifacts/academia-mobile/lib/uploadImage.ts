// Helper de upload de imagem do mobile. Envia um arquivo local ao object
// storage usando uma URL pré-assinada (presigned) e retorna o caminho do objeto
// normalizado para uso nos endpoints de reconhecimento facial (que rodam no
// servidor).
import { requestUploadUrl } from "@workspace/api-client-react";

/**
 * Uploads a local image (picked via expo-image-picker) to object storage via a
 * presigned URL and returns the normalized object path for the face endpoints.
 * All face recognition runs 100% server-side.
 */
export async function uploadImageToStorage(
  localUri: string,
  opts: { name?: string; contentType?: string; size?: number } = {},
): Promise<string> {
  // Lê o arquivo local (file:// ou content://) como blob para enviar.
  const contentType = opts.contentType || "image/jpeg";
  const fileResp = await fetch(localUri);
  const blob = await fileResp.blob();

  // Solicita à API uma URL pré-assinada de upload e o caminho final do objeto.
  const res = await requestUploadUrl({
    name: opts.name || "upload.jpg",
    size: opts.size || blob.size || 1,
    contentType,
  });

  // Faz o PUT do conteúdo diretamente no storage usando a URL pré-assinada.
  const putResp = await fetch(res.uploadURL, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });
  // Em caso de falha no upload, propaga o erro para o chamador tratar.
  if (!putResp.ok) throw new Error("Falha ao enviar a imagem");
  // Retorna o caminho do objeto que a API entende (para enrollFace etc.).
  return res.objectPath;
}
