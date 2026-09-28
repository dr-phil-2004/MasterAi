import { Agent } from '@mastra/core/agent';
import { getDb, listAgentConfigs, type AgentConfigRow } from '@masterai/db';
import { resolveModelChain } from '../lib/models';
import type { RunRuntime } from '../lib/runtime';
import { pickTools } from '../tools';
import { BUILTIN_AGENTS, type AgentDefinition, type Phase } from './roles';

export interface ResolvedAgentConfig extends AgentDefinition {
  enabled: boolean;
  temperature?: number;
}

function fromRow(row: AgentConfigRow): ResolvedAgentConfig {
  return {
    slug: row.slug,
    role: row.role as AgentDefinition['role'],
    name: row.name,
    description: row.description,
    instructions: row.instructions,
    models: row.models,
    tools: row.tools,
    phases: row.phases as Phase[],
    enabled: row.enabled,
    temperature: row.temperature ?? undefined,
  };
}

/** Configurations effectives du tenant : celles en base priment sur les rôles prédéfinis. */
export async function loadAgentConfigs(tenantId: string): Promise<Map<string, ResolvedAgentConfig>> {
  const configs = new Map<string, ResolvedAgentConfig>(BUILTIN_AGENTS.map((a) => [a.slug, { ...a, enabled: true }]));
  const rows = await listAgentConfigs(getDb(), tenantId);
  for (const row of rows) configs.set(row.slug, fromRow(row));
  return configs;
}

export interface BuildAgentOptions {
  escalationLevel?: number;
  extraTools?: Record<string, unknown>;
  subAgents?: Record<string, Agent>;
}

/** Instancie un agent Mastra avec la palette de modèles et les clés de l'utilisateur. */
export function buildAgent(config: ResolvedAgentConfig, runtime: RunRuntime, opts: BuildAgentOptions = {}): Agent {
  const model = resolveModelChain(config.models, runtime.credentials, { escalationLevel: opts.escalationLevel });
  return new Agent({
    id: `${config.slug}-${runtime.runId}`,
    name: config.name,
    description: config.description,
    instructions: config.instructions,
    model,
    tools: { ...pickTools(config.tools), ...(opts.extraTools as Record<string, never>) },
    ...(opts.subAgents ? { agents: opts.subAgents } : {}),
    ...(config.temperature !== undefined
      ? { defaultOptions: { modelSettings: { temperature: config.temperature / 100 } } }
      : {}),
  });
}

/** Agents personnalisés rattachés à une phase (ils interviennent en complément du rôle prédéfini). */
export function customAgentsForPhase(configs: Map<string, ResolvedAgentConfig>, phase: Phase): ResolvedAgentConfig[] {
  return [...configs.values()].filter((c) => c.role === 'custom' && c.enabled && c.phases.includes(phase));
}

/**
 * Agents statiques enregistrés dans l'instance Mastra, pour Mastra Studio (`mastra dev`).
 * Ils utilisent les variables d'environnement des fournisseurs, pas les clés des utilisateurs.
 */
export function studioAgents(): Record<string, Agent> {
  return Object.fromEntries(
    BUILTIN_AGENTS.map((a) => [
      a.slug,
      new Agent({ id: a.slug, name: a.name, description: a.description, instructions: a.instructions, model: a.models[0]! }),
    ]),
  );
}
