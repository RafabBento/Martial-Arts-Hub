// Schema da tabela `monthly_payments`: registra os pagamentos de mensalidade dos
// alunos por mês/ano. Cada linha representa uma mensalidade quitada; a ausência
// de linha para um dado mês/ano indica que aquele período está em aberto.
import { pgTable, serial, integer, timestamp, text } from "drizzle-orm/pg-core";
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
