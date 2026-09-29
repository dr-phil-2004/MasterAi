import { describe, expect, it } from 'vitest';
import { MIGRATION_SQL, pgErrorCode, prepareMigrationStatements } from './migrate';

describe('préparation des migrations', () => {
  it('découpe le SQL en instructions non vides', () => {
    const statements = prepareMigrationStatements(MIGRATION_SQL);
    expect(statements.length).toBeGreaterThan(10);
    expect(statements.every((s) => s.length > 0)).toBe(true);
  });

  it('rend les 8 tables idempotentes avec IF NOT EXISTS', () => {
    const statements = prepareMigrationStatements(MIGRATION_SQL);
    const tables = statements.filter((s) => /^CREATE TABLE /i.test(s));
    expect(tables).toHaveLength(8);
    expect(tables.every((s) => /^CREATE TABLE IF NOT EXISTS /i.test(s))).toBe(true);
  });

  it('enveloppe les 3 types énumérés dans un bloc DO ignorant les doublons', () => {
    const statements = prepareMigrationStatements(MIGRATION_SQL);
    const types = statements.filter((s) => /CREATE TYPE /i.test(s));
    expect(types).toHaveLength(3);
    expect(types.every((s) => /^DO \$\$ BEGIN/i.test(s) && /duplicate_object/.test(s))).toBe(true);
  });

  it('enveloppe les contraintes (ALTER ADD CONSTRAINT) dans un bloc DO', () => {
    const statements = prepareMigrationStatements(MIGRATION_SQL);
    const constraints = statements.filter((s) => /ADD CONSTRAINT/i.test(s));
    expect(constraints.length).toBeGreaterThan(0);
    expect(constraints.every((s) => /^DO \$\$ BEGIN/i.test(s))).toBe(true);
  });

  it('rend les index idempotents avec IF NOT EXISTS', () => {
    const statements = prepareMigrationStatements(MIGRATION_SQL);
    const indexes = statements.filter((s) => /CREATE (UNIQUE )?INDEX/i.test(s));
    expect(indexes.length).toBeGreaterThan(0);
    expect(indexes.every((s) => /INDEX IF NOT EXISTS/i.test(s))).toBe(true);
  });

  it('applique les transformations attendues sur un exemple minimal', () => {
    const sql =
      'CREATE TYPE "e" AS ENUM(\'a\');\n--> statement-breakpoint\nCREATE TABLE "a" (id int);\n--> statement-breakpoint\nCREATE UNIQUE INDEX "a_idx" ON "a" (id);';
    expect(prepareMigrationStatements(sql)).toEqual([
      "DO $$ BEGIN\nCREATE TYPE \"e\" AS ENUM('a');\nEXCEPTION WHEN duplicate_object THEN NULL; END $$;",
      'CREATE TABLE IF NOT EXISTS "a" (id int);',
      'CREATE UNIQUE INDEX IF NOT EXISTS "a_idx" ON "a" (id);',
    ]);
  });
});

describe('pgErrorCode', () => {
  it('trouve le code au premier niveau', () => {
    expect(pgErrorCode({ code: '42710' })).toBe('42710');
  });
  it('remonte la chaîne des causes (drizzle imbrique le code)', () => {
    expect(pgErrorCode({ message: 'Failed query', cause: { code: '42P07' } })).toBe('42P07');
  });
  it('renvoie undefined sans code', () => {
    expect(pgErrorCode(new Error('boom'))).toBeUndefined();
  });
});
