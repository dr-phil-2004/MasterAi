import { countAgentConfigs, ensureDefaultTenant, getDb, upsertAgentConfig } from '@masterai/db';
import { BUILTIN_AGENTS } from './agents/roles';

/**
 * Insère les rôles d'agents prédéfinis pour un tenant. Idempotent.
 * En multi-tenant, appeler à la création de chaque tenant.
 */
export async function seedBuiltinAgents(tenantId: string): Promise<void> {
  const db = getDb();
  for (const agent of BUILTIN_AGENTS) {
    await upsertAgentConfig(db, {
      tenantId,
      slug: agent.slug,
      role: agent.role,
      name: agent.name,
      description: agent.description,
      instructions: agent.instructions,
      models: agent.models,
      tools: agent.tools,
      phases: agent.phases,
      isBuiltin: true,
    });
  }
}

async function main() {
  const db = getDb();
  const ctx = await ensureDefaultTenant(db, process.env.MASTERAI_OWNER_EMAIL ?? 'owner@masterai.local');
  await seedBuiltinAgents(ctx.tenantId);
  console.log(`Seed terminé : tenant ${ctx.tenantId}, ${await countAgentConfigs(db, ctx.tenantId)} agents.`);
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
