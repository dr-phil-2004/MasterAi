import { sql } from 'drizzle-orm';
import type { Database } from './client';

/**
 * SQL de migration embarqué (généré depuis packages/db/drizzle).
 * Embarqué en dur pour permettre une initialisation depuis un environnement serverless
 * (Vercel) sans dépendre du bundling du dossier de migrations.
 * IMPORTANT : à chaque nouvelle migration Drizzle, régénérer ce fichier
 * (voir scripts/gen-migrate.mjs) pour y refléter le nouveau SQL.
 */
export const MIGRATION_SQL = "CREATE TYPE \"public\".\"integration_kind\" AS ENUM('github', 'vercel', 'neon', 'figma', 'slack', 'email');--> statement-breakpoint\nCREATE TYPE \"public\".\"project_status\" AS ENUM('draft', 'running', 'staging', 'production', 'failed', 'cancelled');--> statement-breakpoint\nCREATE TYPE \"public\".\"run_status\" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint\nCREATE TABLE \"agent_configs\" (\n\t\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,\n\t\"tenant_id\" uuid NOT NULL,\n\t\"slug\" text NOT NULL,\n\t\"role\" text NOT NULL,\n\t\"name\" text NOT NULL,\n\t\"description\" text NOT NULL,\n\t\"instructions\" text NOT NULL,\n\t\"models\" jsonb NOT NULL,\n\t\"tools\" jsonb DEFAULT '[]'::jsonb NOT NULL,\n\t\"phases\" jsonb DEFAULT '[]'::jsonb NOT NULL,\n\t\"temperature_pct\" integer,\n\t\"enabled\" boolean DEFAULT true NOT NULL,\n\t\"is_builtin\" boolean DEFAULT false NOT NULL,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\t\"updated_at\" timestamp with time zone DEFAULT now() NOT NULL\n);\n--> statement-breakpoint\nCREATE TABLE \"integrations\" (\n\t\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,\n\t\"tenant_id\" uuid NOT NULL,\n\t\"user_id\" uuid NOT NULL,\n\t\"kind\" \"integration_kind\" NOT NULL,\n\t\"encrypted_secret\" text,\n\t\"config\" jsonb DEFAULT '{}'::jsonb NOT NULL,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\t\"updated_at\" timestamp with time zone DEFAULT now() NOT NULL\n);\n--> statement-breakpoint\nCREATE TABLE \"projects\" (\n\t\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,\n\t\"tenant_id\" uuid NOT NULL,\n\t\"created_by\" uuid NOT NULL,\n\t\"name\" text NOT NULL,\n\t\"slug\" text NOT NULL,\n\t\"spec_file_name\" text,\n\t\"spec_text\" text,\n\t\"source_repo\" text,\n\t\"repo_url\" text,\n\t\"staging_url\" text,\n\t\"production_url\" text,\n\t\"status\" \"project_status\" DEFAULT 'draft' NOT NULL,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\t\"updated_at\" timestamp with time zone DEFAULT now() NOT NULL\n);\n--> statement-breakpoint\nCREATE TABLE \"provider_credentials\" (\n\t\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,\n\t\"tenant_id\" uuid NOT NULL,\n\t\"user_id\" uuid NOT NULL,\n\t\"provider\" text NOT NULL,\n\t\"encrypted_api_key\" text,\n\t\"base_url\" text,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\t\"updated_at\" timestamp with time zone DEFAULT now() NOT NULL\n);\n--> statement-breakpoint\nCREATE TABLE \"run_events\" (\n\t\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,\n\t\"run_id\" uuid NOT NULL,\n\t\"phase\" text NOT NULL,\n\t\"agent\" text,\n\t\"level\" text DEFAULT 'info' NOT NULL,\n\t\"message\" text NOT NULL,\n\t\"data\" jsonb,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL\n);\n--> statement-breakpoint\nCREATE TABLE \"runs\" (\n\t\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,\n\t\"tenant_id\" uuid NOT NULL,\n\t\"project_id\" uuid NOT NULL,\n\t\"workflow_run_id\" text,\n\t\"status\" \"run_status\" DEFAULT 'queued' NOT NULL,\n\t\"phase\" text,\n\t\"iteration\" integer DEFAULT 0 NOT NULL,\n\t\"report\" text,\n\t\"started_at\" timestamp with time zone,\n\t\"finished_at\" timestamp with time zone,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\t\"updated_at\" timestamp with time zone DEFAULT now() NOT NULL\n);\n--> statement-breakpoint\nCREATE TABLE \"tenants\" (\n\t\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,\n\t\"name\" text NOT NULL,\n\t\"slug\" text NOT NULL,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\t\"updated_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\tCONSTRAINT \"tenants_slug_unique\" UNIQUE(\"slug\")\n);\n--> statement-breakpoint\nCREATE TABLE \"users\" (\n\t\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,\n\t\"tenant_id\" uuid NOT NULL,\n\t\"email\" text NOT NULL,\n\t\"name\" text,\n\t\"role\" text DEFAULT 'owner' NOT NULL,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\t\"updated_at\" timestamp with time zone DEFAULT now() NOT NULL\n);\n--> statement-breakpoint\nALTER TABLE \"agent_configs\" ADD CONSTRAINT \"agent_configs_tenant_id_tenants_id_fk\" FOREIGN KEY (\"tenant_id\") REFERENCES \"public\".\"tenants\"(\"id\") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint\nALTER TABLE \"integrations\" ADD CONSTRAINT \"integrations_tenant_id_tenants_id_fk\" FOREIGN KEY (\"tenant_id\") REFERENCES \"public\".\"tenants\"(\"id\") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint\nALTER TABLE \"integrations\" ADD CONSTRAINT \"integrations_user_id_users_id_fk\" FOREIGN KEY (\"user_id\") REFERENCES \"public\".\"users\"(\"id\") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint\nALTER TABLE \"projects\" ADD CONSTRAINT \"projects_tenant_id_tenants_id_fk\" FOREIGN KEY (\"tenant_id\") REFERENCES \"public\".\"tenants\"(\"id\") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint\nALTER TABLE \"projects\" ADD CONSTRAINT \"projects_created_by_users_id_fk\" FOREIGN KEY (\"created_by\") REFERENCES \"public\".\"users\"(\"id\") ON DELETE no action ON UPDATE no action;--> statement-breakpoint\nALTER TABLE \"provider_credentials\" ADD CONSTRAINT \"provider_credentials_tenant_id_tenants_id_fk\" FOREIGN KEY (\"tenant_id\") REFERENCES \"public\".\"tenants\"(\"id\") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint\nALTER TABLE \"provider_credentials\" ADD CONSTRAINT \"provider_credentials_user_id_users_id_fk\" FOREIGN KEY (\"user_id\") REFERENCES \"public\".\"users\"(\"id\") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint\nALTER TABLE \"run_events\" ADD CONSTRAINT \"run_events_run_id_runs_id_fk\" FOREIGN KEY (\"run_id\") REFERENCES \"public\".\"runs\"(\"id\") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint\nALTER TABLE \"runs\" ADD CONSTRAINT \"runs_tenant_id_tenants_id_fk\" FOREIGN KEY (\"tenant_id\") REFERENCES \"public\".\"tenants\"(\"id\") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint\nALTER TABLE \"runs\" ADD CONSTRAINT \"runs_project_id_projects_id_fk\" FOREIGN KEY (\"project_id\") REFERENCES \"public\".\"projects\"(\"id\") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint\nALTER TABLE \"users\" ADD CONSTRAINT \"users_tenant_id_tenants_id_fk\" FOREIGN KEY (\"tenant_id\") REFERENCES \"public\".\"tenants\"(\"id\") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint\nCREATE UNIQUE INDEX \"agent_configs_tenant_slug_idx\" ON \"agent_configs\" USING btree (\"tenant_id\",\"slug\");--> statement-breakpoint\nCREATE UNIQUE INDEX \"integrations_user_kind_idx\" ON \"integrations\" USING btree (\"user_id\",\"kind\");--> statement-breakpoint\nCREATE UNIQUE INDEX \"projects_tenant_slug_idx\" ON \"projects\" USING btree (\"tenant_id\",\"slug\");--> statement-breakpoint\nCREATE UNIQUE INDEX \"provider_credentials_user_provider_idx\" ON \"provider_credentials\" USING btree (\"user_id\",\"provider\");--> statement-breakpoint\nCREATE INDEX \"run_events_run_idx\" ON \"run_events\" USING btree (\"run_id\",\"created_at\");--> statement-breakpoint\nCREATE INDEX \"runs_project_idx\" ON \"runs\" USING btree (\"project_id\");--> statement-breakpoint\nCREATE UNIQUE INDEX \"users_tenant_email_idx\" ON \"users\" USING btree (\"tenant_id\",\"email\");";

/** Codes d'erreur PostgreSQL « objet déjà existant » : rendent la migration idempotente. */
const ALREADY_EXISTS = new Set(['42P07', '42710', '42P06', '42P16', '42704', '23505']);

/**
 * Découpe le SQL en instructions exécutables et rend les index idempotents
 * (`CREATE INDEX IF NOT EXISTS`). Fonction pure, testable sans base.
 */
export function prepareMigrationStatements(migrationSql: string): string[] {
  return migrationSql
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/^CREATE (UNIQUE )?INDEX /i, (_m, u) => `CREATE ${u ?? ''}INDEX IF NOT EXISTS `));
}

/**
 * Applique le schéma de façon idempotente : chaque instruction est exécutée,
 * et les erreurs « existe déjà » sont ignorées (rejouable sans risque).
 */
export async function runMigrations(db: Database): Promise<{ applied: number; skipped: number }> {
  const statements = prepareMigrationStatements(MIGRATION_SQL);

  let applied = 0;
  let skipped = 0;
  for (const statement of statements) {
    try {
      await db.execute(sql.raw(statement));
      applied++;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code && ALREADY_EXISTS.has(code)) {
        skipped++;
        continue;
      }
      throw error;
    }
  }
  return { applied, skipped };
}
