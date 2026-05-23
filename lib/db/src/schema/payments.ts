import { pgTable, serial, integer, timestamp, text } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const monthlyPaymentsTable = pgTable("monthly_payments", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
  paidByName: text("paid_by_name"),
  notes: text("notes"),
});

export type MonthlyPayment = typeof monthlyPaymentsTable.$inferSelect;
