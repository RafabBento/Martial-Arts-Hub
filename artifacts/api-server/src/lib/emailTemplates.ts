// =============================================================================
// lib/emailTemplates.ts — Templates HTML dos e-mails transacionais.
// Inline styles (sem CSS externo) por compatibilidade com clientes de e-mail.
// =============================================================================

const BRAND_COLOR = "#dc2626";

function layout(title: string, bodyHtml: string): string {
  return `
    <div style="font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #1a1a1a;">
      <h1 style="font-size: 20px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 4px;">Front Artes Marciais</h1>
      <div style="height: 3px; width: 48px; background: ${BRAND_COLOR}; margin-bottom: 24px;"></div>
      <h2 style="font-size: 16px; margin: 0 0 16px;">${title}</h2>
      ${bodyHtml}
      <p style="font-size: 12px; color: #888; margin-top: 32px;">
        Este é um e-mail automático — não é necessário responder.
      </p>
    </div>
  `;
}

export function verificationEmail({ name, verifyUrl }: { name: string; verifyUrl: string }): { subject: string; html: string } {
  return {
    subject: "Confirme seu cadastro — Front Artes Marciais",
    html: layout(
      `Olá, ${name.split(" ")[0]}!`,
      `
        <p style="font-size: 14px; line-height: 1.6;">
          Falta só um passo para ativar seu cadastro na Front Artes Marciais.
          Clique no botão abaixo para confirmar seu e-mail:
        </p>
        <a href="${verifyUrl}" style="display: inline-block; background: ${BRAND_COLOR}; color: #fff; font-weight: 700; font-size: 14px; text-decoration: none; padding: 12px 24px; border-radius: 8px; margin: 12px 0;">
          Confirmar e-mail
        </a>
        <p style="font-size: 12px; color: #666; line-height: 1.6;">
          Se o botão não funcionar, copie e cole este link no navegador:<br>
          <a href="${verifyUrl}" style="color: ${BRAND_COLOR};">${verifyUrl}</a>
        </p>
        <p style="font-size: 12px; color: #666;">Este link expira em 48 horas.</p>
      `,
    ),
  };
}

export function passwordResetEmail({ name, resetUrl }: { name: string; resetUrl: string }): { subject: string; html: string } {
  return {
    subject: "Redefinir sua senha — Front Artes Marciais",
    html: layout(
      `Olá, ${name.split(" ")[0]}!`,
      `
        <p style="font-size: 14px; line-height: 1.6;">
          Recebemos um pedido para redefinir a senha da sua conta. Clique no botão
          abaixo para escolher uma nova senha:
        </p>
        <a href="${resetUrl}" style="display: inline-block; background: ${BRAND_COLOR}; color: #fff; font-weight: 700; font-size: 14px; text-decoration: none; padding: 12px 24px; border-radius: 8px; margin: 12px 0;">
          Redefinir senha
        </a>
        <p style="font-size: 12px; color: #666; line-height: 1.6;">
          Se o botão não funcionar, copie e cole este link no navegador:<br>
          <a href="${resetUrl}" style="color: ${BRAND_COLOR};">${resetUrl}</a>
        </p>
        <p style="font-size: 12px; color: #666;">
          Este link expira em 1 hora. Se você não pediu essa redefinição, pode ignorar este e-mail.
        </p>
      `,
    ),
  };
}

export function healthDeclarationEmail({
  name,
  isMinor,
  hasInjury,
  injuryDetails,
  hasCondition,
  conditionDetails,
  takesMedication,
  medicationDetails,
  emergencyContactName,
  emergencyContactPhone,
  imageConsent,
  guardianName,
  guardianPhone,
}: {
  name: string;
  isMinor: boolean;
  hasInjury: boolean;
  injuryDetails: string | null;
  hasCondition: boolean;
  conditionDetails: string | null;
  takesMedication: boolean;
  medicationDetails: string | null;
  emergencyContactName: string;
  emergencyContactPhone: string;
  imageConsent: boolean;
  guardianName: string | null;
  guardianPhone: string | null;
}): { subject: string; html: string } {
  const yesNo = (v: boolean) => (v ? "Sim" : "Não");
  const row = (label: string, value: string) => `
    <div style="margin-bottom: 6px;"><strong>${label}:</strong> ${value}</div>
  `;

  const declarationText = isMinor
    ? "Li e declaro que estou deixando meu filho treinar com a Front."
    : "Declaro que li e que as informações acima são verdadeiras.";

  return {
    subject: "Confirmação do termo de saúde e responsabilidade — Front Artes Marciais",
    html: layout(
      `Olá, ${name.split(" ")[0]}!`,
      `
        <p style="font-size: 14px; line-height: 1.6;">
          Recebemos o termo de saúde e responsabilidade preenchido no seu cadastro.
          Segue abaixo uma cópia do que foi declarado:
        </p>
        <div style="background: #f5f5f5; border-radius: 8px; padding: 16px; margin: 16px 0; font-size: 14px;">
          ${row("Possui lesão ou limitação", yesNo(hasInjury) + (hasInjury && injuryDetails ? ` — ${injuryDetails}` : ""))}
          ${row("Possui doença ou condição", yesNo(hasCondition) + (hasCondition && conditionDetails ? ` — ${conditionDetails}` : ""))}
          ${row("Faz uso de medicamento contínuo", yesNo(takesMedication) + (takesMedication && medicationDetails ? ` — ${medicationDetails}` : ""))}
          ${row("Contato de emergência", `${emergencyContactName} — ${emergencyContactPhone}`)}
          ${row("Autoriza uso de imagens", yesNo(imageConsent))}
          ${isMinor ? row("Responsável", `${guardianName ?? "-"} — ${guardianPhone ?? "-"}`) : ""}
        </div>
        <p style="font-size: 14px; line-height: 1.6; font-style: italic;">
          "${declarationText}"
        </p>
        <p style="font-size: 12px; color: #666;">
          Se alguma dessas informações estiver incorreta, entre em contato com a academia.
        </p>
      `,
    ),
  };
}

export function paymentReminderEmail({
  name,
  paymentDay,
  dueDateLabel,
}: {
  name: string;
  paymentDay: number;
  dueDateLabel: string;
}): { subject: string; html: string } {
  return {
    subject: "Sua mensalidade vence em breve — Front Artes Marciais",
    html: layout(
      `Olá, ${name.split(" ")[0]}!`,
      `
        <p style="font-size: 14px; line-height: 1.6;">
          Passando para lembrar que sua mensalidade vence <strong>dia ${paymentDay}</strong>
          (${dueDateLabel}). Fique de olho para não deixar para a última hora!
        </p>
        <div style="background: #f5f5f5; border-radius: 8px; padding: 16px; margin: 16px 0; font-size: 14px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;"><strong>Valor</strong><span style="float:right">R$ 80,00</span></div>
          <div style="margin-bottom: 4px;"><strong>Banco:</strong> Caixa Econômica Federal</div>
          <div style="margin-bottom: 4px;"><strong>Recebedor:</strong> Ewerton Tadeu da Silva</div>
          <div><strong>Chave PIX (e-mail):</strong> frontrecebimento@gmail.com</div>
        </div>
        <p style="font-size: 12px; color: #666;">
          Após o pagamento, envie o comprovante para o professor confirmar.
        </p>
      `,
    ),
  };
}
