import type { IntegrationSecret, ProviderCredential } from '@masterai/db';

export interface MissingPrerequisite {
  /** Identifiant stable (utile pour l'UI). */
  id: 'model' | 'github' | 'vercel' | 'vercel-sandbox' | 'neon';
  label: string;
  /** Page de l'UI où le corriger. */
  href: string;
}

/**
 * Vérifie, avant de lancer une chaîne, que l'utilisateur a configuré le minimum nécessaire.
 * Refuser tout de suite avec une liste claire vaut mieux qu'un échec obscur au milieu de la chaîne.
 */
export function checkRunPrerequisites(
  credentials: ProviderCredential[],
  integrations: IntegrationSecret[],
): MissingPrerequisite[] {
  const missing: MissingPrerequisite[] = [];
  const usable = credentials.some((c) => Boolean(c.apiKey) || (c.provider.startsWith('custom:') && Boolean(c.baseUrl)));
  if (!usable) {
    missing.push({ id: 'model', label: 'Une clé API de modèle (Anthropic, OpenAI, Google…)', href: '/settings/models' });
  }
  const byKind = new Map(integrations.map((i) => [i.kind, i]));
  if (!byKind.get('github')?.secret) {
    missing.push({ id: 'github', label: 'Le jeton GitHub (dépôt et pull requests)', href: '/settings/integrations' });
  }
  const vercel = byKind.get('vercel');
  if (!vercel?.secret) {
    missing.push({ id: 'vercel', label: 'Le jeton Vercel (sandbox et déploiements)', href: '/settings/integrations' });
  } else if (!vercel.config.sandboxProjectId) {
    missing.push({
      id: 'vercel-sandbox',
      label: 'Le projet Vercel utilisé pour les sandboxes (champ « Projet pour les sandboxes »)',
      href: '/settings/integrations',
    });
  }
  if (!byKind.get('neon')?.secret) {
    missing.push({ id: 'neon', label: 'La clé API Neon (base de données du projet généré)', href: '/settings/integrations' });
  }
  return missing;
}
