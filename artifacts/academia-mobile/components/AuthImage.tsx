// Componente de imagem autenticada. Carrega imagens privadas do object storage
// (servidas pela API atrás de autenticação) anexando o token Bearer no header,
// já que no mobile os cookies de sessão não são enviados automaticamente.
import { Image, type ImageStyle, type StyleProp } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { imageUrl } from "@/lib/imageUrl";

type ResizeMode = "cover" | "contain" | "stretch" | "center" | "repeat";

interface AuthImageProps {
  path: string | null | undefined;
  style?: StyleProp<ImageStyle>;
  resizeMode?: ResizeMode;
}

/**
 * Renders a remote image stored in object storage. Private objects are served
 * by the API behind session auth; on native, cookies are NOT sent, so we attach
 * the Bearer token (the same one the API client uses) as a request header so the
 * server's bearerAuth middleware can authorize the image request. Without this,
 * profile/team photos return 401 on physical devices.
 */
export function AuthImage({ path, style, resizeMode }: AuthImageProps) {
  // Token da sessão atual usado para autorizar o download da imagem privada.
  const { token } = useAuth();
  // Converte o caminho relativo armazenado em uma URL absoluta carregável.
  const uri = imageUrl(path);
  // Sem caminho/URL válida não há nada para renderizar.
  if (!uri) return null;
  // Anexa o header Authorization apenas para URLs remotas (arquivos locais
  // "file:" não passam pela API e não precisam do token).
  const source =
    token && !uri.startsWith("file:")
      ? { uri, headers: { Authorization: `Bearer ${token}` } }
      : { uri };
  return <Image source={source} style={style} resizeMode={resizeMode} />;
}
