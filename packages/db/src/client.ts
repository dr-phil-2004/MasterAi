import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Database = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __masteraiDb?: Database };

/**
 * Résout la chaîne de connexion PostgreSQL, en tolérant :
 * - les noms standard (`DATABASE_URL`, `POSTGRES_URL`) ;
 * - les variantes injectées par l'intégration Postgres/Neon de Vercel ;
 * - **un préfixe** ajouté par l'intégration (ex. `masterAi_DATABASE_URL`) : on accepte
 *   toute variable dont le nom se termine par `DATABASE_URL` ou `POSTGRES_URL` (connexion poolée),
 *   puis, à défaut, les variantes non poolées.
 */
export function resolveDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const direct = env.DATABASE_URL ?? env.POSTGRES_URL;
  if (direct) return direct;

  const value = (re: RegExp) => {
    const key = Object.keys(env).find((k) => re.test(k) && env[k]);
    return key ? env[key] : undefined;
  };
  return (
    value(/(^|_)(DATABASE_URL|POSTGRES_URL)$/) ??
    value(/(^|_)(DATABASE_URL_UNPOOLED|POSTGRES_URL_NON_POOLING)$/)
  );
}

/** Client Drizzle unique par processus (réutilisé entre les invocations serverless). */
export function getDb(url = resolveDatabaseUrl()): Database {
  if (globalForDb.__masteraiDb) return globalForDb.__masteraiDb;
  if (!url) throw new Error('DATABASE_URL est manquante.');
  const sql = postgres(url, { max: 5, prepare: false });
  globalForDb.__masteraiDb = drizzle(sql, { schema });
  return globalForDb.__masteraiDb;
}
