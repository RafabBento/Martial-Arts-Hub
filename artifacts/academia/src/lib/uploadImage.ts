import { requestUploadUrl } from "@workspace/api-client-react";

/**
 * Uploads an image to object storage via a presigned URL and returns the
 * normalized object path (e.g. `/objects/uploads/<uuid>`) for use with the
 * face endpoints. All face recognition runs 100% server-side.
 */
export async function uploadImageToStorage(file: File): Promise<string> {
  const contentType = file.type || "image/jpeg";
  const res = await requestUploadUrl({
    name: file.name || "upload.jpg",
    size: file.size || 1,
    contentType,
  });
  const putResp = await fetch(res.uploadURL, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: file,
  });
  if (!putResp.ok) throw new Error("Falha ao enviar a imagem");
  return res.objectPath;
}
