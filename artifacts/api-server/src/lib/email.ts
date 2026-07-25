// =============================================================================
// lib/email.ts — Envio de e-mail transacional via Resend.
// Wrapper fino: nunca deixa uma falha de envio derrubar o fluxo que a chamou
// (registro, verificação, lembrete) — só loga o erro. RESEND_API_KEY ausente
// em dev/local também apenas loga um aviso e segue sem enviar.
// =============================================================================
import { Resend } from "resend";
import { logger } from "./logger";

const apiKey = process.env["RESEND_API_KEY"];
const resend = apiKey ? new Resend(apiKey) : null;

// Remetente padrão; sobrescrevível por env (ex.: naoresponda@frontartesmarciais.com).
const FROM = process.env["EMAIL_FROM"] ?? "Martial Arts Hub <onboarding@resend.dev>";

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  if (!resend) {
    logger.warn({ to, subject }, "RESEND_API_KEY não configurada — e-mail não enviado");
    return;
  }
  try {
    const { error } = await resend.emails.send({ from: FROM, to, subject, html });
    if (error) {
      logger.error({ err: error, to, subject }, "Falha ao enviar e-mail via Resend");
    }
  } catch (err) {
    logger.error({ err, to, subject }, "Erro inesperado ao enviar e-mail");
  }
}
