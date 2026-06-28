// =============================================================================
// index.ts — Ponto de entrada (bootstrap) do servidor da API.
// Lê e valida a porta a partir do ambiente e sobe o app Express configurado
// em app.ts. Falha cedo (throw) se a configuração de PORT for inválida.
// =============================================================================
import app from "./app";
import { logger } from "./lib/logger";

// A porta é obrigatória e deve vir do ambiente — não assumimos um default.
const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

// Converte para número e valida: precisa ser um inteiro positivo válido.
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Sobe o servidor HTTP. Se o bind à porta falhar, loga e encerra o processo
// com código de erro para que o supervisor/runner perceba a falha.
app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
