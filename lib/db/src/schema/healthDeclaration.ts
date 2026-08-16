// Schema da tabela `health_declarations`: termo de saúde/responsabilidade
// preenchido no cadastro (relação 1:1 com users). Guarda o "retrato" do que foi
// declarado no momento do cadastro — não é editável depois, é um registro do
// termo assinado (mudanças de saúde reais são tratadas fora do sistema).
import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const healthDeclarationsTable = pgTable("health_declarations", {
  id: serial("id").primaryKey(),
  // FK para users.id. `unique()` garante a relação 1:1 (um termo por usuário) e
  // onDelete cascade remove o termo automaticamente se o usuário for excluído.
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }).unique(),
  hasInjury: boolean("has_injury").notNull().default(false),
  injuryDetails: text("injury_details"),
  hasCondition: boolean("has_condition").notNull().default(false),
  conditionDetails: text("condition_details"),
  takesMedication: boolean("takes_medication").notNull().default(false),
  medicationDetails: text("medication_details"),
  // Contato de emergência — sempre exigido, e sempre uma pessoa diferente do
  // próprio usuário (validado no backend).
  emergencyContactName: text("emergency_contact_name").notNull(),
  emergencyContactPhone: text("emergency_contact_phone").notNull(),
  imageConsent: boolean("image_consent").notNull().default(false),
  // Calculado a partir da data de nascimento no momento do cadastro (não muda
  // retroativamente se o usuário completar 18 anos depois).
  isMinor: boolean("is_minor").notNull().default(false),
  // Preenchido apenas quando isMinor é true.
  guardianName: text("guardian_name"),
  guardianPhone: text("guardian_phone"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertHealthDeclarationSchema = createInsertSchema(healthDeclarationsTable).omit({ id: true, createdAt: true });
export type InsertHealthDeclaration = z.infer<typeof insertHealthDeclarationSchema>;
export type HealthDeclaration = typeof healthDeclarationsTable.$inferSelect;
