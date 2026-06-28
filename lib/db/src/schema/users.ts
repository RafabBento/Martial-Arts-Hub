// Schema da tabela `users`: entidade central de pessoas do sistema (alunos,
// professores e admins). Guarda credenciais, dados de perfil, modalidades
// praticadas e graduações. Também define os enums de papel (role) e unidade.
import { pgTable, serial, integer, text, timestamp, boolean, date, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Enum de papéis de acesso: controla autorização/role-based access em toda a app.
export const roleEnum = pgEnum("role", ["student", "teacher", "admin"]);
// Enum das unidades físicas (academias) às quais o usuário pertence.
export const unitEnum = pgEnum("unit", ["matriz", "panobianco", "upfitness"]);

export const usersTable = pgTable("users", {
  // Chave primária auto-incremental.
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  // E-mail é único e usado como identificador de login.
  email: text("email").notNull().unique(),
  // Hash da senha (nunca a senha em texto puro) gerado no API server.
  passwordHash: text("password_hash").notNull(),
  // Papel do usuário; por padrão todo novo cadastro entra como "student".
  role: roleEnum("role").notNull().default("student"),
  phone: text("phone"),
  // URL da foto de perfil (armazenada em object storage).
  profilePhotoUrl: text("profile_photo_url"),
  birthDate: date("birth_date"),
  // Dia do mês (1-31) de vencimento da mensalidade, usado nos lembretes de pagamento.
  paymentDay: integer("payment_day"),
  // Flags indicando quais modalidades o aluno pratica (Muay Thai / Jiu-Jitsu).
  modalityThai: boolean("modality_thai"),
  modalityJiu: boolean("modality_jiu"),
  // Graduação de Muay Thai: nome do grau e cor associada (exibida na UI).
  thaiGrade: text("thai_grade"),
  thaiGradeColor: text("thai_grade_color"),
  // Graduação de Jiu-Jitsu: faixa, cor da faixa e número de graus (degrees).
  jiuGrade: text("jiu_grade"),
  jiuGradeColor: text("jiu_grade_color"),
  jiuDegree: integer("jiu_degree"),
  // Unidade onde o usuário treina; por padrão "matriz".
  unit: unitEnum("unit").notNull().default("matriz"),
  // Timestamps de auditoria: criação e última atualização.
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // $onUpdate atualiza automaticamente o updatedAt a cada UPDATE da linha.
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// Zod schema para inserts: omite colunas geradas pelo banco (id e timestamps).
export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
// Tipo TS do payload de inserção, inferido do zod schema acima.
export type InsertUser = z.infer<typeof insertUserSchema>;
// Tipo TS da linha como retornada em SELECT (inclui id e timestamps).
export type User = typeof usersTable.$inferSelect;
