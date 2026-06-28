// Hook que devolve os tokens de cor da paleta ativa conforme o esquema do
// dispositivo (claro/escuro), com fallback para a paleta padrão.
import { useColorScheme } from "react-native";

import colors from "@/constants/colors";

/**
 * Returns the design tokens for the current color scheme.
 *
 * The returned object contains all color tokens for the active palette
 * plus scheme-independent values like `radius`.
 *
 * Falls back to the light palette when no dark key is defined in
 * constants/colors.ts (the scaffold ships light-only by default).
 * When a sibling web artifact's dark tokens are synced into a `dark`
 * key, this hook will automatically switch palettes based on the
 * device's appearance setting.
 */
export function useColors() {
  // Esquema de cor atual do dispositivo (claro/escuro/null).
  const scheme = useColorScheme();
  // Escolhe a paleta "dark" apenas se ela existir; caso contrário usa "light".
  const palette =
    scheme === "dark" && "dark" in colors
      ? (colors as Record<string, typeof colors.light>).dark
      : colors.light;
  // Combina os tokens da paleta com valores independentes de tema (ex.: radius).
  return { ...palette, radius: colors.radius };
}
