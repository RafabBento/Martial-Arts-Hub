// Schema da tabela `email_verification_tokens`: tokens de uso único enviados por
// e-mail no cadastro, usados para confirmar o e-mail do usuário. Cada linha
// expira em 48h (ver EMAIL_VERIFICATION_TTL_MS em routes/auth.ts) e é apagada
// após o uso (verificação bem-sucedida) ou reenvio (token antigo invalidado).
import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const emailVerificationTokensTable = pgTable("email_verification_tokens", {
  id: serial("id").primaryKey(),
  // FK para users.id; cascade remove os tokens se o usuário for excluído.
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EmailVerificationToken = typeof emailVerificationTokensTable.$inferSelect;

// Tokens de redefinição de senha ("esqueci minha senha"), mesmo formato dos de
// verificação de e-mail: uso único, expira em 1h (ver PASSWORD_RESET_TTL_MS em
// routes/auth.ts), apagado após o uso ou ao gerar um novo (invalida os antigos).
export const passwordResetTokensTable = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PasswordResetToken = typeof passwordResetTokensTable.$inferSelect;
