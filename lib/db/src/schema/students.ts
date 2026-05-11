import { pgTable, serial, integer, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const studentProfilesTable = pgTable("student_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }).unique(),
  modalityThai: boolean("modality_thai").notNull().default(false),
  modalityJiu: boolean("modality_jiu").notNull().default(false),
  thaiGrade: text("thai_grade"),
  jiuGrade: text("jiu_grade"),
  thaiGradeColor: text("thai_grade_color"),
  jiuGradeColor: text("jiu_grade_color"),
  faceDescriptor: jsonb("face_descriptor"),
  facePhotoUrl: text("face_photo_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertStudentProfileSchema = createInsertSchema(studentProfilesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStudentProfile = z.infer<typeof insertStudentProfileSchema>;
export type StudentProfile = typeof studentProfilesTable.$inferSelect;
