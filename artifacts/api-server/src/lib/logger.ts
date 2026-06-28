// =============================================================================
// logger.ts — Logger compartilhado (pino) usado por toda a API.
// Centraliza o nível de log, a redação de cabeçalhos sensíveis e o formato de
// saída (bonito em dev, JSON cru em produção).
// =============================================================================
import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  // Nível configurável via ambiente (default "info").
  level: process.env.LOG_LEVEL ?? "info",
  // Redige (oculta) cabeçalhos sensíveis para não vazar credenciais nos logs:
  // token de autorização, cookie de sessão e o set-cookie da resposta.
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  // Em produção mantém o output padrão (JSON, ideal para agregadores de log);
  // em desenvolvimento usa pino-pretty para uma saída colorida e legível.
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
