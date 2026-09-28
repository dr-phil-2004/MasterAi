import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Schéma multi-tenant : chaque ressource est rattachée à un `tenantId`.
 * En mode mono-utilisateur (V1), un tenant et un utilisateur par défaut sont créés au seed.
 */

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  ...timestamps,
});

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    name: text('name'),
    role: text('role', { enum: ['owner', 'admin', 'member'] }).notNull().default('owner'),
    ...timestamps,
  },
  (t) => [uniqueIndex('users_tenant_email_idx').on(t.tenantId, t.email)],
);

/** Clés API des fournisseurs de modèles, propres à chaque utilisateur (BYOK), chiffrées AES-256-GCM. */
export const providerCredentials = pgTable(
  'provider_credentials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    /** Identifiant fournisseur du routeur Mastra (`anthropic`, `openai`…) ou `custom:<nom>`. */
    provider: text('provider').notNull(),
    encryptedApiKey: text('encrypted_api_key'),
    /** URL de base pour les fournisseurs compatibles OpenAI (Ollama, LM Studio, vLLM…). */
    baseUrl: text('base_url'),
    ...timestamps,
  },
  (t) => [uniqueIndex('provider_credentials_user_provider_idx').on(t.userId, t.provider)],
);

export const integrationKind = pgEnum('integration_kind', [
  'github',
  'vercel',
  'neon',
  'figma',
  'slack',
  'email',
]);

/** Jetons des intégrations externes (GitHub, Vercel, Neon, Figma, Slack, e-mail), chiffrés. */
export const integrations = pgTable(
  'integrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    kind: integrationKind('kind').notNull(),
    encryptedSecret: text('encrypted_secret'),
    /** Paramètres non secrets : teamId Vercel, owner GitHub, destinataires e-mail… */
    config: jsonb('config').$type<Record<string, string>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [uniqueIndex('integrations_user_kind_idx').on(t.userId, t.kind)],
);

/**
 * Configuration des agents. Les rôles prédéfinis sont créés au seed (`isBuiltin`)
 * et restent modifiables ; l'utilisateur peut en créer d'autres (`role = custom`).
 */
export const agentConfigs = pgTable(
  'agent_configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    role: text('role').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    instructions: text('instructions').notNull(),
    /** Modèle principal puis modèles de repli, au format `fournisseur/modèle`. */
    models: jsonb('models').$type<string[]>().notNull(),
    tools: jsonb('tools').$type<string[]>().notNull().default([]),
    /** Phases de la chaîne auxquelles un agent personnalisé participe en complément. */
    phases: jsonb('phases').$type<string[]>().notNull().default([]),
    temperature: integer('temperature_pct'),
    enabled: boolean('enabled').notNull().default(true),
    isBuiltin: boolean('is_builtin').notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex('agent_configs_tenant_slug_idx').on(t.tenantId, t.slug)],
);

export const projectStatus = pgEnum('project_status', [
  'draft',
  'running',
  'staging',
  'production',
  'failed',
  'cancelled',
]);

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    specFileName: text('spec_file_name'),
    specText: text('spec_text'),
    /** Dépôt existant sur lequel travailler (optionnel) ; sinon un dépôt est créé. */
    sourceRepo: text('source_repo'),
    repoUrl: text('repo_url'),
    stagingUrl: text('staging_url'),
    productionUrl: text('production_url'),
    status: projectStatus('status').notNull().default('draft'),
    ...timestamps,
  },
  (t) => [uniqueIndex('projects_tenant_slug_idx').on(t.tenantId, t.slug)],
);

export const runStatus = pgEnum('run_status', [
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
]);

export const runs = pgTable(
  'runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    workflowRunId: text('workflow_run_id'),
    status: runStatus('status').notNull().default('queued'),
    phase: text('phase'),
    iteration: integer('iteration').notNull().default(0),
    /** Rapport détaillé final (Markdown). */
    report: text('report'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index('runs_project_idx').on(t.projectId)],
);

/** Journal des opérations de chaque exécution, affiché en temps réel dans l'UI et repris dans le rapport. */
export const runEvents = pgTable(
  'run_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id').notNull().references(() => runs.id, { onDelete: 'cascade' }),
    phase: text('phase').notNull(),
    agent: text('agent'),
    level: text('level', { enum: ['info', 'success', 'warning', 'error'] }).notNull().default('info'),
    message: text('message').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('run_events_run_idx').on(t.runId, t.createdAt)],
);

export type Tenant = typeof tenants.$inferSelect;
export type User = typeof users.$inferSelect;
export type AgentConfigRow = typeof agentConfigs.$inferSelect;
export type NewAgentConfigRow = typeof agentConfigs.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type Run = typeof runs.$inferSelect;
export type RunEvent = typeof runEvents.$inferSelect;
export type IntegrationKind = (typeof integrationKind.enumValues)[number];
