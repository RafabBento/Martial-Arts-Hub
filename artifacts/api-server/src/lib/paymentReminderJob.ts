// =============================================================================
// lib/paymentReminderJob.ts — Lembrete de vencimento de mensalidade por e-mail.
// Roda 1x/dia: para cada aluno com paymentDay definido (e não isento — bolsista
// ou unidade parceira), calcula a próxima data de vencimento e, se faltarem
// exatamente 5 dias, envia um e-mail de lembrete. O dedupe é persistente
// (paymentRemindersSentTable) porque o processo reinicia a cada deploy — um
// restart no dia certo não pode duplicar o envio do mesmo mês/ano.
// =============================================================================
import { eq, and } from "drizzle-orm";
import { db, usersTable, studentProfilesTable, monthlyPaymentsTable, paymentRemindersSentTable } from "@workspace/db";
import { sendEmail } from "./email";
import { paymentReminderEmail } from "./emailTemplates";
import { logger } from "./logger";

// Dias de antecedência do lembrete (confirmado com o usuário).
const REMINDER_DAYS_BEFORE = 5;
// Horário fixo (hora local, ver TZ=America/Sao_Paulo no env) em que o job roda todo dia.
const RUN_AT_HOUR = 9;

// Calcula a próxima data de vencimento (paymentDay deste mês, ou do mês
// seguinte se já passou) a partir de "hoje".
function nextDueDate(paymentDay: number, today: Date): Date {
  const candidate = new Date(today.getFullYear(), today.getMonth(), paymentDay);
  if (candidate < new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
    return new Date(today.getFullYear(), today.getMonth() + 1, paymentDay);
  }
  return candidate;
}

function daysBetween(a: Date, b: Date): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

// Executa uma checagem completa: percorre todos os alunos com paymentDay,
// pula isentos e quem já pagou o mês, e envia o lembrete a quem estiver a
// exatamente REMINDER_DAYS_BEFORE dias do vencimento. Retorna um resumo para
// log/teste manual (rota /admin/run-payment-reminder-check).
export async function runPaymentReminderCheck(): Promise<{ checked: number; sent: number }> {
  const today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

  const students = await db
    .select({
      userId: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      paymentDay: usersTable.paymentDay,
      unit: usersTable.unit,
      scholarship: studentProfilesTable.scholarship,
    })
    .from(usersTable)
    .innerJoin(studentProfilesTable, eq(usersTable.id, studentProfilesTable.userId))
    .where(eq(usersTable.role, "student"));

  let checked = 0;
  let sent = 0;

  for (const s of students) {
    if (!s.paymentDay) continue;
    checked += 1;

    // Isento (bolsista ou unidade parceira) nunca recebe cobrança.
    const exempt = s.unit !== "matriz" || s.scholarship;
    if (exempt) continue;

    const dueDate = nextDueDate(s.paymentDay, today);
    if (daysBetween(today, dueDate) !== REMINDER_DAYS_BEFORE) continue;

    const dueMonth = dueDate.getMonth() + 1;
    const dueYear = dueDate.getFullYear();

    // Já pagou adiantado o mês do vencimento em questão — não precisa cobrar.
    const [existingPayment] = await db
      .select({ id: monthlyPaymentsTable.id })
      .from(monthlyPaymentsTable)
      .where(and(
        eq(monthlyPaymentsTable.studentId, s.userId),
        eq(monthlyPaymentsTable.month, dueMonth),
        eq(monthlyPaymentsTable.year, dueYear),
      ));
    if (existingPayment) continue;

    // Dedupe persistente: só envia se conseguir inserir o registro (não havia
    // lembrete ainda para esse aluno/mês/ano). onConflictDoNothing + returning
    // vazio = já tinha sido enviado (por execução anterior ou restart).
    const inserted = await db
      .insert(paymentRemindersSentTable)
      .values({ studentId: s.userId, month: dueMonth, year: dueYear })
      .onConflictDoNothing()
      .returning({ id: paymentRemindersSentTable.id });
    if (inserted.length === 0) continue;

    const { subject, html } = paymentReminderEmail({
      name: s.name,
      paymentDay: s.paymentDay,
      dueDateLabel: dueDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" }),
    });
    await sendEmail({ to: s.email, subject, html });
    sent += 1;
  }

  logger.info({ checked, sent }, "Checagem de lembrete de vencimento concluída");
  return { checked, sent };
}

// Agenda a checagem para rodar 1x/dia às RUN_AT_HOUR (hora local do processo —
// ver TZ=America/Sao_Paulo no env de produção). Mesmo idioma do timer de
// virada de dia já usado em Attendance.tsx: setTimeout até o próximo horário,
// executa, e reagenda para o dia seguinte.
export function schedulePaymentReminderJob(): void {
  const schedule = () => {
    const now = new Date();
    let next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), RUN_AT_HOUR, 0, 0, 0);
    if (next <= now) next = new Date(next.getTime() + 24 * 60 * 60 * 1000);
    setTimeout(() => {
      runPaymentReminderCheck().catch((err) => {
        logger.error({ err }, "Falha ao rodar a checagem de lembrete de vencimento");
      });
      schedule();
    }, next.getTime() - now.getTime());
  };
  schedule();
}
