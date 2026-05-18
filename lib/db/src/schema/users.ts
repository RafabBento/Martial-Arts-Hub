import { pgTable, serial, integer, text, timestamp, boolean, date, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const roleEnum = pgEnum("role", ["student", "teacher", "admin"]);

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("student"),
  phone: text("phone"),
  profilePhotoUrl: text("profile_photo_url"),
  birthDate: date("birth_date"),
  paymentDay: integer("payment_day"),
  modalityThai: boolean("modality_thai"),
  modalityJiu: boolean("modality_jiu"),
  thaiGrade: text("thai_grade"),
  thaiGradeColor: text("thai_grade_color"),
  jiuGrade: text("jiu_grade"),
  jiuGradeColor: text("jiu_grade_color"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
