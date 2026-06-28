import { pgTable, serial, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const studentFaceDescriptorsTable = pgTable("student_face_descriptors", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  descriptor: jsonb("descriptor").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFaceDescriptorSchema = createInsertSchema(studentFaceDescriptorsTable).omit({ id: true, createdAt: true });
export type InsertFaceDescriptor = z.infer<typeof insertFaceDescriptorSchema>;
export type FaceDescriptorRow = typeof studentFaceDescriptorsTable.$inferSelect;
