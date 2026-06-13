/**
 * Resolves a stored image path to an absolute URL the native Image component
 * can load. Profile photos are stored as relative paths (e.g.
 * `/api/storage/objects/uploads/<uuid>`); native requires the full domain.
 */
export function imageUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (!domain) return path;
  return `https://${domain}${path.startsWith("/") ? "" : "/"}${path}`;
}
