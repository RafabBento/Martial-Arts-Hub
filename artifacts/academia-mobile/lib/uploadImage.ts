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
  const contentType = opts.contentType || "image/jpeg";
  const fileResp = await fetch(localUri);
  const blob = await fileResp.blob();

  const res = await requestUploadUrl({
    name: opts.name || "upload.jpg",
    size: opts.size || blob.size || 1,
    contentType,
  });

  const putResp = await fetch(res.uploadURL, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });
  if (!putResp.ok) throw new Error("Falha ao enviar a imagem");
  return res.objectPath;
}
