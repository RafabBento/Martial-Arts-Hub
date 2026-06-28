// Schema da tabela `training_sessions`: representa uma aula/treino agendado de
// uma modalidade, ministrado por um professor. É a entidade à qual os registros
// de presença (attendance) se vinculam.
import { pgTable, serial, integer, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// Enum da modalidade da sessão (Muay Thai ou Jiu-Jitsu).
export const modalityEnum = pgEnum("modality", ["thai", "jiu"]);

export const trainingSessionsTable = pgTable("training_sessions", {
  id: serial("id").primaryKey(),
  // Modalidade do treino; obrigatória.
  modality: modalityEnum("modality").notNull(),
  // Data/hora em que a sessão ocorre.
  sessionDate: timestamp("session_date", { withTimezone: true }).notNull(),
  description: text("description"),
  // Professor responsável pela sessão (FK para users.id).
  teacherId: integer("teacher_id").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Zod schema de insert (omite id e createdAt) e tipos inferidos.
export const insertTrainingSessionSchema = createInsertSchema(trainingSessionsTable).omit({ id: true, createdAt: true });
export type InsertTrainingSession = z.infer<typeof insertTrainingSessionSchema>;
export type TrainingSession = typeof trainingSessionsTable.$inferSelect;
