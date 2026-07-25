// Schema da tabela `monthly_payments`: registra os pagamentos de mensalidade dos
// alunos por mês/ano. Cada linha representa uma mensalidade quitada; a ausência
// de linha para um dado mês/ano indica que aquele período está em aberto.
import { pgTable, serial, integer, timestamp, text, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const monthlyPaymentsTable = pgTable("monthly_payments", {
  id: serial("id").primaryKey(),
  // Aluno que efetuou o pagamento (FK para users.id; cascade na exclusão do usuário).
  studentId: integer("student_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  // Mês (1-12) e ano de referência da mensalidade paga.
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  // Momento em que o pagamento foi registrado (default: agora).
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
  // Nome de quem registrou/recebeu o pagamento (ex.: professor/admin) para auditoria.
  paidByName: text("paid_by_name"),
  notes: text("notes"),
});

// Tipo TS da linha de pagamento como retornada em SELECT.
export type MonthlyPayment = typeof monthlyPaymentsTable.$inferSelect;

// Schema da tabela `payment_reminders_sent`: dedupe persistente do lembrete de
// vencimento por e-mail (5 dias antes do paymentDay). Precisa ser persistente
// (não em memória) porque o processo do api-server reinicia a cada deploy —
// um restart no dia certo não pode reenviar o lembrete do mesmo mês/ano.
export const paymentRemindersSentTable = pgTable("payment_reminders_sent", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("payment_reminders_sent_student_month_year_idx").on(t.studentId, t.month, t.year),
]);

export type PaymentReminderSent = typeof paymentRemindersSentTable.$inferSelect;
