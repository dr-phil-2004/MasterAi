import { describe, expect, it } from 'vitest';
import { MIGRATION_SQL, prepareMigrationStatements } from './migrate';

describe('préparation des migrations', () => {
  it('découpe le SQL en instructions non vides', () => {
    const statements = prepareMigrationStatements(MIGRATION_SQL);
    expect(statements.length).toBeGreaterThan(10);
    expect(statements.every((s) => s.length > 0)).toBe(true);
  });

  it('crée les 8 tables et 3 types énumérés attendus', () => {
    const statements = prepareMigrationStatements(MIGRATION_SQL);
    expect(statements.filter((s) => /^CREATE TABLE/i.test(s))).toHaveLength(8);
    expect(statements.filter((s) => /^CREATE TYPE/i.test(s))).toHaveLength(3);
  });

  it('rend les index idempotents avec IF NOT EXISTS', () => {
    const statements = prepareMigrationStatements(MIGRATION_SQL);
    const indexes = statements.filter((s) => /CREATE (UNIQUE )?INDEX/i.test(s));
    expect(indexes.length).toBeGreaterThan(0);
    expect(indexes.every((s) => /INDEX IF NOT EXISTS/i.test(s))).toBe(true);
  });

  it('préserve la casse et le contenu des instructions sur un exemple minimal', () => {
    const sql = 'CREATE TABLE "a" (id int);\n--> statement-breakpoint\nCREATE UNIQUE INDEX "a_idx" ON "a" (id);';
    expect(prepareMigrationStatements(sql)).toEqual([
      'CREATE TABLE "a" (id int);',
      'CREATE UNIQUE INDEX IF NOT EXISTS "a_idx" ON "a" (id);',
    ]);
  });
});
