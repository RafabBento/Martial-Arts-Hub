// =============================================================================
// routes/health.ts — Endpoint de health check.
// Usado por monitoramento/load balancers para verificar se a API está no ar.
// Não exige autenticação e sempre responde 200 com { status: "ok" }.
// =============================================================================
import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

// GET /healthz — liveness probe simples; valida o payload pelo schema zod
// (garantindo o contrato) antes de respondê-lo.
router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

export default router;
