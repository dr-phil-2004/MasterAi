import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Database = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __masteraiDb?: Database };

/** Client Drizzle unique par processus (réutilisé entre les invocations serverless). */
export function getDb(url = process.env.DATABASE_URL): Database {
  if (globalForDb.__masteraiDb) return globalForDb.__masteraiDb;
  if (!url) throw new Error('DATABASE_URL est manquante.');
  const sql = postgres(url, { max: 5, prepare: false });
  globalForDb.__masteraiDb = drizzle(sql, { schema });
  return globalForDb.__masteraiDb;
}
