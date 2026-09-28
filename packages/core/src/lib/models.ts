import { PROVIDER_REGISTRY } from '@mastra/core/llm';
import type { ProviderCredential } from '@masterai/db';

/**
 * Palette de modèles.
 * Les fournisseurs viennent du routeur de modèles de Mastra (plus de 200 fournisseurs),
 * complétés par des fournisseurs « custom » compatibles OpenAI (Ollama, LM Studio, vLLM…).
 * Chaque utilisateur fournit ses propres clés (BYOK) : aucune clé de la plateforme n'est utilisée.
 */

export const CUSTOM_PROVIDER_PREFIX = 'custom:';

export interface PaletteProvider {
  id: string;
  name: string;
  models: string[];
  docUrl?: string;
  configured: boolean;
}

/** Fournisseurs mis en avant dans l'UI (les autres restent accessibles via la recherche). */
export const FEATURED_PROVIDERS = [
  'anthropic',
  'openai',
  'google',
  'mistral',
  'deepseek',
  'xai',
  'groq',
  'openrouter',
  'vercel',
];

export function listPalette(credentials: ProviderCredential[], { all = false } = {}): PaletteProvider[] {
  const configured = new Set(credentials.map((c) => c.provider));
  const registry = Object.entries(PROVIDER_REGISTRY as Record<string, { name: string; models: string[]; docUrl?: string; deprecatedModels?: string[] }>)
    .filter(([id]) => all || FEATURED_PROVIDERS.includes(id) || configured.has(id))
    .map(([id, cfg]) => ({
      id,
      name: cfg.name,
      models: cfg.models.filter((m) => !(cfg.deprecatedModels ?? []).includes(m)).map((m) => `${id}/${m}`),
      docUrl: cfg.docUrl,
      configured: configured.has(id),
    }));

  const custom = credentials
    .filter((c) => c.provider.startsWith(CUSTOM_PROVIDER_PREFIX))
    .map((c) => ({
      id: c.provider,
      name: `${c.provider.slice(CUSTOM_PROVIDER_PREFIX.length)} (compatible OpenAI)`,
      models: [],
      configured: true,
    }));

  return [...registry, ...custom].sort(
    (a, b) => Number(b.configured) - Number(a.configured) || a.name.localeCompare(b.name),
  );
}

export function providerOf(modelId: string): string {
  if (modelId.startsWith(CUSTOM_PROVIDER_PREFIX)) {
    // custom:ollama/llama3.3 → custom:ollama
    return modelId.slice(0, modelId.indexOf('/'));
  }
  return modelId.split('/')[0] ?? modelId;
}

/** Entrée de la chaîne de repli attendue par `Agent.model` dans Mastra. */
export interface ResolvedModelEntry {
  model:
    | { id: `${string}/${string}`; apiKey?: string }
    | { providerId: string; modelId: string; url?: string; apiKey?: string };
  maxRetries: number;
}

export class MissingCredentialError extends Error {
  constructor(public readonly models: string[]) {
    super(
      `Aucune clé API configurée pour les modèles : ${models.join(', ')}. Ajoutez une clé dans Paramètres → Modèles.`,
    );
  }
}

/**
 * Construit la chaîne de modèles (principal + repli) avec les clés de l'utilisateur.
 * Les modèles dont le fournisseur n'a pas de clé sont ignorés.
 * `escalationLevel` fait passer un modèle de repli en tête : utilisé quand la boucle de correction stagne.
 */
export function resolveModelChain(
  models: string[],
  credentials: ProviderCredential[],
  { escalationLevel = 0, maxRetries = 2 }: { escalationLevel?: number; maxRetries?: number } = {},
): ResolvedModelEntry[] {
  const byProvider = new Map(credentials.map((c) => [c.provider, c]));
  const usable: ResolvedModelEntry[] = [];

  for (const modelId of models) {
    const provider = providerOf(modelId);
    const cred = byProvider.get(provider);
    if (!cred) continue;
    if (provider.startsWith(CUSTOM_PROVIDER_PREFIX)) {
      if (!cred.baseUrl) continue;
      usable.push({
        model: {
          providerId: provider.slice(CUSTOM_PROVIDER_PREFIX.length),
          modelId: modelId.slice(provider.length + 1),
          url: cred.baseUrl,
          apiKey: cred.apiKey,
        },
        maxRetries,
      });
    } else {
      if (!cred.apiKey) continue;
      usable.push({ model: { id: modelId as `${string}/${string}`, apiKey: cred.apiKey }, maxRetries });
    }
  }

  if (usable.length === 0) throw new MissingCredentialError(models);

  const shift = escalationLevel % usable.length;
  return [...usable.slice(shift), ...usable.slice(0, shift)];
}
