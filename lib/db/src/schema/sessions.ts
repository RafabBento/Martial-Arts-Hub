import { pgTable, serial, integer, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const modalityEnum = pgEnum("modality", ["thai", "jiu"]);

export const trainingSessionsTable = pgTable("training_sessions", {
  id: serial("id").primaryKey(),
  modality: modalityEnum("modality").notNull(),
  sessionDate: timestamp("session_date", { withTimezone: true }).notNull(),
  description: text("description"),
  teacherId: integer("teacher_id").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTrainingSessionSchema = createInsertSchema(trainingSessionsTable).omit({ id: true, createdAt: true });
export type InsertTrainingSession = z.infer<typeof insertTrainingSessionSchema>;
export type TrainingSession = typeof trainingSessionsTable.$inferSelect;
