import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Database = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __masteraiDb?: Database };

/**
 * Chaîne de connexion PostgreSQL. Accepte `DATABASE_URL`, ou les noms injectés
 * par l'intégration Postgres/Neon de Vercel (`POSTGRES_URL`, variante non « poolée »).
 */
export function resolveDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? process.env.DATABASE_URL_UNPOOLED ?? process.env.POSTGRES_URL_NON_POOLING;
}

/** Client Drizzle unique par processus (réutilisé entre les invocations serverless). */
export function getDb(url = resolveDatabaseUrl()): Database {
  if (globalForDb.__masteraiDb) return globalForDb.__masteraiDb;
  if (!url) throw new Error('DATABASE_URL est manquante.');
  const sql = postgres(url, { max: 5, prepare: false });
  globalForDb.__masteraiDb = drizzle(sql, { schema });
  return globalForDb.__masteraiDb;
}
