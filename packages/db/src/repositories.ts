import { and, asc, desc, eq, gt } from 'drizzle-orm';
import type { Database } from './client';
import { decryptSecret, encryptSecret } from './crypto';
import {
  agentConfigs,
  integrations,
  projects,
  providerCredentials,
  runEvents,
  runs,
  tenants,
  users,
  type AgentConfigRow,
  type IntegrationKind,
  type NewAgentConfigRow,
  type RunEvent,
} from './schema';

// ---------------------------------------------------------------------------
// Tenants et utilisateurs (mode mono-utilisateur en V1)
// ---------------------------------------------------------------------------

/** Crée (si besoin) le tenant et l'utilisateur par défaut, et renvoie leur contexte. */
export async function ensureDefaultTenant(db: Database, ownerEmail: string): Promise<TenantContext> {
  const [created] = await db
    .insert(tenants)
    .values({ name: 'MasterAI', slug: 'default' })
    .onConflictDoNothing({ target: tenants.slug })
    .returning();
  const tenant = created ?? (await db.select().from(tenants).where(eq(tenants.slug, 'default')))[0];
  if (!tenant) throw new Error('Tenant par défaut introuvable.');
  const [user] = await db
    .insert(users)
    .values({ tenantId: tenant.id, email: ownerEmail, name: 'Propriétaire', role: 'owner' })
    .onConflictDoNothing()
    .returning();
  const userId = user?.id ?? (await db.select().from(users).where(eq(users.tenantId, tenant.id)))[0]?.id;
  if (!userId) throw new Error('Utilisateur par défaut introuvable.');
  return { tenantId: tenant.id, userId };
}

export async function getDefaultContext(db: Database): Promise<TenantContext> {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, 'default'));
  if (!tenant) throw new Error('Aucun tenant : lancez `pnpm db:seed`.');
  const [user] = await db.select().from(users).where(eq(users.tenantId, tenant.id));
  if (!user) throw new Error('Aucun utilisateur : lancez `pnpm db:seed`.');
  return { tenantId: tenant.id, userId: user.id };
}

export async function countAgentConfigs(db: Database, tenantId: string): Promise<number> {
  return (await db.select().from(agentConfigs).where(eq(agentConfigs.tenantId, tenantId))).length;
}

/** Identité portée par chaque requête : prépare le multi-tenant dès la V1. */
export interface TenantContext {
  tenantId: string;
  userId: string;
}

// ---------------------------------------------------------------------------
// Clés fournisseurs (BYOK)
// ---------------------------------------------------------------------------

export interface ProviderCredential {
  provider: string;
  apiKey?: string;
  baseUrl?: string;
}

export async function listProviderCredentials(db: Database, ctx: TenantContext): Promise<ProviderCredential[]> {
  const rows = await db
    .select()
    .from(providerCredentials)
    .where(and(eq(providerCredentials.tenantId, ctx.tenantId), eq(providerCredentials.userId, ctx.userId)));
  return rows.map((r) => ({
    provider: r.provider,
    apiKey: r.encryptedApiKey ? decryptSecret(r.encryptedApiKey) : undefined,
    baseUrl: r.baseUrl ?? undefined,
  }));
}

export async function upsertProviderCredential(
  db: Database,
  ctx: TenantContext,
  input: ProviderCredential,
): Promise<void> {
  const values = {
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    provider: input.provider,
    encryptedApiKey: input.apiKey ? encryptSecret(input.apiKey) : null,
    baseUrl: input.baseUrl ?? null,
  };
  await db
    .insert(providerCredentials)
    .values(values)
    .onConflictDoUpdate({
      target: [providerCredentials.userId, providerCredentials.provider],
      set: { ...values, updatedAt: new Date() },
    });
}

export async function deleteProviderCredential(db: Database, ctx: TenantContext, provider: string): Promise<void> {
  await db
    .delete(providerCredentials)
    .where(and(eq(providerCredentials.userId, ctx.userId), eq(providerCredentials.provider, provider)));
}

// ---------------------------------------------------------------------------
// Intégrations (GitHub, Vercel, Neon, Figma, Slack, e-mail)
// ---------------------------------------------------------------------------

export interface IntegrationSecret {
  kind: IntegrationKind;
  secret?: string;
  config: Record<string, string>;
}

export async function listIntegrations(db: Database, ctx: TenantContext): Promise<IntegrationSecret[]> {
  const rows = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.tenantId, ctx.tenantId), eq(integrations.userId, ctx.userId)));
  return rows.map((r) => ({
    kind: r.kind,
    secret: r.encryptedSecret ? decryptSecret(r.encryptedSecret) : undefined,
    config: r.config,
  }));
}

export async function upsertIntegration(db: Database, ctx: TenantContext, input: IntegrationSecret): Promise<void> {
  const values = {
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    kind: input.kind,
    encryptedSecret: input.secret ? encryptSecret(input.secret) : null,
    config: input.config,
  };
  await db
    .insert(integrations)
    .values(values)
    .onConflictDoUpdate({
      target: [integrations.userId, integrations.kind],
      set: { ...values, updatedAt: new Date() },
    });
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export async function listAgentConfigs(db: Database, tenantId: string): Promise<AgentConfigRow[]> {
  return db.select().from(agentConfigs).where(eq(agentConfigs.tenantId, tenantId)).orderBy(asc(agentConfigs.createdAt));
}

export async function getAgentConfig(db: Database, tenantId: string, slug: string): Promise<AgentConfigRow | undefined> {
  const [row] = await db
    .select()
    .from(agentConfigs)
    .where(and(eq(agentConfigs.tenantId, tenantId), eq(agentConfigs.slug, slug)));
  return row;
}

export async function upsertAgentConfig(db: Database, input: NewAgentConfigRow): Promise<AgentConfigRow> {
  const [row] = await db
    .insert(agentConfigs)
    .values(input)
    .onConflictDoUpdate({
      target: [agentConfigs.tenantId, agentConfigs.slug],
      set: { ...input, updatedAt: new Date() },
    })
    .returning();
  if (!row) throw new Error(`Impossible d'enregistrer l'agent ${input.slug}.`);
  return row;
}

export async function deleteAgentConfig(db: Database, tenantId: string, slug: string): Promise<void> {
  await db
    .delete(agentConfigs)
    .where(and(eq(agentConfigs.tenantId, tenantId), eq(agentConfigs.slug, slug), eq(agentConfigs.isBuiltin, false)));
}

// ---------------------------------------------------------------------------
// Projets et exécutions
// ---------------------------------------------------------------------------

export async function listProjects(db: Database, tenantId: string) {
  return db.select().from(projects).where(eq(projects.tenantId, tenantId)).orderBy(desc(projects.createdAt));
}

export async function getProject(db: Database, tenantId: string, id: string) {
  const [row] = await db.select().from(projects).where(and(eq(projects.tenantId, tenantId), eq(projects.id, id)));
  return row;
}

export async function updateProject(
  db: Database,
  id: string,
  patch: Partial<Pick<typeof projects.$inferInsert, 'repoUrl' | 'stagingUrl' | 'productionUrl' | 'status'>>,
) {
  await db.update(projects).set({ ...patch, updatedAt: new Date() }).where(eq(projects.id, id));
}

export async function listRuns(db: Database, tenantId: string, projectId?: string) {
  const where = projectId
    ? and(eq(runs.tenantId, tenantId), eq(runs.projectId, projectId))
    : eq(runs.tenantId, tenantId);
  return db.select().from(runs).where(where).orderBy(desc(runs.createdAt));
}

export async function getRun(db: Database, tenantId: string, id: string) {
  const [row] = await db.select().from(runs).where(and(eq(runs.tenantId, tenantId), eq(runs.id, id)));
  return row;
}

export async function updateRun(
  db: Database,
  id: string,
  patch: Partial<
    Pick<typeof runs.$inferInsert, 'status' | 'phase' | 'iteration' | 'report' | 'workflowRunId' | 'startedAt' | 'finishedAt'>
  >,
) {
  await db.update(runs).set({ ...patch, updatedAt: new Date() }).where(eq(runs.id, id));
}

export async function appendRunEvent(
  db: Database,
  event: Pick<RunEvent, 'runId' | 'phase' | 'message'> & Partial<Pick<RunEvent, 'agent' | 'level' | 'data'>>,
): Promise<void> {
  await db.insert(runEvents).values(event);
}

export async function listRunEvents(db: Database, runId: string, after?: Date): Promise<RunEvent[]> {
  const where = after ? and(eq(runEvents.runId, runId), gt(runEvents.createdAt, after)) : eq(runEvents.runId, runId);
  return db.select().from(runEvents).where(where).orderBy(asc(runEvents.createdAt));
}
