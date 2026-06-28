// Tokens de design (paleta de cores e raio de borda) do app mobile. O tema é
// escuro por padrão (a chave "light" carrega os valores usados na aplicação).
// O hook useColors() consome estes tokens para estilizar os componentes.
const colors = {
  // Paleta principal: fundos, textos, cores semânticas e as cores específicas
  // de cada modalidade (thai/jiu) além de estados de sucesso/aviso.
  light: {
    text: "#f2f2f2",
    tint: "#d42b2b",
    background: "#0d0d0d",
    foreground: "#f2f2f2",
    card: "#1a1a1a",
    cardForeground: "#f2f2f2",
    primary: "#d42b2b",
    primaryForeground: "#ffffff",
    secondary: "#262626",
    secondaryForeground: "#f2f2f2",
    muted: "#1f1f1f",
    mutedForeground: "#777777",
    accent: "#2a0a0a",
    accentForeground: "#f2f2f2",
    destructive: "#d42b2b",
    destructiveForeground: "#ffffff",
    border: "#2a2a2a",
    input: "#222222",
    thai: "#d42b2b",
    jiu: "#3b82f6",
    success: "#22c55e",
    warning: "#f59e0b",
  },

  // Raio de borda padrão (independente do esquema de cores).
  radius: 10,
};

export default colors;
