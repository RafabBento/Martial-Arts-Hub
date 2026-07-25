// =============================================================================
// routes/admin.ts — Rotas administrativas internas (admin-only).
// Não fazem parte do fluxo de nenhuma tela; servem para operação/depuração.
// =============================================================================
import { Router, type IRouter } from "express";
import { getSessionUserId, getRequester } from "../lib/authz";
import { runPaymentReminderCheck } from "../lib/paymentReminderJob";

const router: IRouter = Router();

// POST /admin/run-payment-reminder-check — dispara manualmente a checagem de
// lembrete de vencimento. Admin-only. Existe porque o projeto não tem
// ambiente de staging — permite validar o pipeline de e-mail em produção sem
// esperar a data real de vencimento de algum aluno.
router.post("/admin/run-payment-reminder-check", async (req, res): Promise<void> => {
  const requester = await getRequester(getSessionUserId(req));
  if (!requester) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  if (requester.role !== "admin") {
    res.status(403).json({ error: "Acesso restrito a administradores" });
    return;
  }

  const result = await runPaymentReminderCheck();
  res.json(result);
});

export default router;
