// Schema da tabela `student_profiles`: dados específicos do aluno que estendem
// o registro em `users` (relação 1:1). Centraliza modalidades, graduações e os
// dados de reconhecimento facial usados na presença automática.
import { pgTable, serial, integer, text, boolean, timestamp, jsonb, smallint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const studentProfilesTable = pgTable("student_profiles", {
  id: serial("id").primaryKey(),
  // FK para users.id. `unique()` garante a relação 1:1 (um perfil por usuário) e
  // onDelete cascade remove o perfil automaticamente se o usuário for excluído.
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }).unique(),
  // Modalidades praticadas pelo aluno.
  modalityThai: boolean("modality_thai").notNull().default(false),
  modalityJiu: boolean("modality_jiu").notNull().default(false),
  // Flag de regra de negócio "bollacha" (status/benefício específico da academia).
  bollacha: boolean("bollacha").notNull().default(false),
  // Graduação de Muay Thai e de Jiu-Jitsu (faixa + grau).
  thaiGrade: text("thai_grade"),
  jiuGrade: text("jiu_grade"),
  // Número de graus da faixa de Jiu-Jitsu (smallint pois é um valor pequeno).
  jiuDegree: smallint("jiu_degree"),
  // Cores associadas às graduações, usadas para renderizar os badges na UI.
  thaiGradeColor: text("thai_grade_color"),
  jiuGradeColor: text("jiu_grade_color"),
  // Descritor facial "principal" (vetor de floats serializado em JSON) usado no
  // reconhecimento facial. Descritores adicionais ficam em student_face_descriptors.
  faceDescriptor: jsonb("face_descriptor"),
  // URL da foto facial de referência (object storage).
  facePhotoUrl: text("face_photo_url"),
  // Timestamps de auditoria; updatedAt é atualizado automaticamente em cada UPDATE.
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// Zod schema de insert (sem id e timestamps gerados pelo banco) e tipos inferidos.
export const insertStudentProfileSchema = createInsertSchema(studentProfilesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStudentProfile = z.infer<typeof insertStudentProfileSchema>;
export type StudentProfile = typeof studentProfilesTable.$inferSelect;
