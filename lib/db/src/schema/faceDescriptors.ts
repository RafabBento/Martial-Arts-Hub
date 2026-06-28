// Schema da tabela `student_face_descriptors`: armazena múltiplos descritores
// faciais (vetores de 128 floats) por aluno, capturados em ângulos diferentes
// durante o cadastro facial. Quanto mais descritores, mais robusto fica o
// reconhecimento. Complementa o faceDescriptor "principal" em student_profiles.
import { pgTable, serial, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const studentFaceDescriptorsTable = pgTable("student_face_descriptors", {
  id: serial("id").primaryKey(),
  // Aluno dono do descritor (FK para users.id; cascade apaga os descritores junto).
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  // Vetor de embedding facial (array de floats) serializado como JSON.
  descriptor: jsonb("descriptor").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Zod schema de insert (omite id e createdAt) e tipos inferidos.
export const insertFaceDescriptorSchema = createInsertSchema(studentFaceDescriptorsTable).omit({ id: true, createdAt: true });
export type InsertFaceDescriptor = z.infer<typeof insertFaceDescriptorSchema>;
export type FaceDescriptorRow = typeof studentFaceDescriptorsTable.$inferSelect;
