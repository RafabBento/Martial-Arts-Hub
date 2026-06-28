// Ponto de entrada do pacote de banco de dados (@workspace/db).
// Cria e exporta a instância única do Drizzle ORM conectada ao PostgreSQL,
// além de reexportar todo o schema (tabelas, enums, tipos e zod schemas)
// para que os demais pacotes (API server, scripts) consumam a partir daqui.
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

// O driver `pg` é CommonJS; desestruturamos o Pool a partir do default export.
const { Pool } = pg;

// Falha rápido ("fail fast") na inicialização caso a connection string não exista.
// Evita que a aplicação suba parcialmente e só quebre quando a primeira query rodar.
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Pool de conexões compartilhado com o Postgres (reaproveita conexões entre requests).
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// Instância do Drizzle com o `schema` injetado, habilitando a query API tipada
// (ex.: db.query.usersTable.findMany) com inferência de tipos das tabelas.
export const db = drizzle(pool, { schema });

// Reexporta tudo do schema para que `import { usersTable } from "@workspace/db"` funcione.
export * from "./schema";
