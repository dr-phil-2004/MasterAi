// Régénère packages/db/src/migrate.ts en embarquant le dernier SQL de migration.
// Usage : node scripts/gen-migrate.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const dir = 'packages/db/drizzle';
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const sqlCombined = files.map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n--> statement-breakpoint\n');
const body = readFileSync('packages/db/src/migrate.ts', 'utf8').replace(
  /export const MIGRATION_SQL = [\s\S]*?;\n/,
  `export const MIGRATION_SQL = ${JSON.stringify(sqlCombined)};\n`,
);
writeFileSync('packages/db/src/migrate.ts', body);
console.log(`migrate.ts régénéré depuis ${files.length} migration(s).`);
