// Utilitário que transforma um caminho de imagem armazenado em uma URL absoluta.
// No mobile, o componente Image precisa do domínio completo (ao contrário da
// web, onde caminhos relativos funcionam).
/**
 * Resolves a stored image path to an absolute URL the native Image component
 * can load. Profile photos are stored as relative paths (e.g.
 * `/api/storage/objects/uploads/<uuid>`); native requires the full domain.
 */
export function imageUrl(path: string | null | undefined): string | undefined {
  // Sem caminho não há URL a resolver.
  if (!path) return undefined;
  // Se já for uma URL absoluta, devolve como está.
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  // Domínio da API definido em variável de ambiente pública do Expo.
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  // Sem domínio configurado, retorna o caminho relativo inalterado.
  if (!domain) return path;
  // Prefixa o domínio, garantindo exatamente uma barra entre domínio e caminho.
  return `https://${domain}${path.startsWith("/") ? "" : "/"}${path}`;
}
