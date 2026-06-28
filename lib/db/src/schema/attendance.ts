// Schema da tabela `attendance`: registra a presença de um aluno em uma sessão
// de treino. Tabela de junção entre training_sessions e users, com metadados de
// reconhecimento facial e foto pós-treino.
import { pgTable, serial, integer, text, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { trainingSessionsTable } from "./sessions";
import { usersTable } from "./users";

export const attendanceTable = pgTable("attendance", {
  id: serial("id").primaryKey(),
  // FK para a sessão; cascade apaga as presenças se a sessão for removida.
  sessionId: integer("session_id").notNull().references(() => trainingSessionsTable.id, { onDelete: "cascade" }),
  // FK para o aluno; cascade apaga as presenças se o usuário for removido.
  studentId: integer("student_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  // URL da foto tirada após o treino (object storage).
  postTrainingPhotoUrl: text("post_training_photo_url"),
  // Indica se a presença foi marcada via reconhecimento facial (true) ou manual (false).
  faceRecognized: boolean("face_recognized").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Constraint de unicidade: impede registrar o mesmo aluno duas vezes na mesma sessão.
  unique().on(t.sessionId, t.studentId),
]);

// Zod schema de insert (omite id e createdAt) e tipos inferidos.
export const insertAttendanceSchema = createInsertSchema(attendanceTable).omit({ id: true, createdAt: true });
export type InsertAttendance = z.infer<typeof insertAttendanceSchema>;
export type Attendance = typeof attendanceTable.$inferSelect;
