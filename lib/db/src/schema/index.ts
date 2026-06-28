// Barrel file do schema: agrega e reexporta todas as definições de tabelas,
// enums, zod schemas de insert e tipos inferidos. Centraliza os imports do
// schema em um único módulo consumido pela instância do Drizzle (../index.ts).
export * from "./users";
export * from "./students";
export * from "./faceDescriptors";
export * from "./sessions";
export * from "./attendance";
export * from "./payments";
