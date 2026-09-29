/** Forme d'un agent dans l'éditeur (miroir du schéma de `PUT /api/agents`). */
export interface EditorAgent {
  slug: string;
  role: string;
  name: string;
  description: string;
  instructions: string;
  models: string[];
  tools: string[];
  phases: string[];
  /** Température en pourcentage (0–100), `null` = valeur par défaut du modèle. */
  temperature: number | null;
  enabled: boolean;
  isBuiltin: boolean;
}

export const SLUG_PATTERN = /^[a-z0-9-]+$/;

/** Dérive un identifiant d'agent lisible depuis son nom (« Relecteur API » → « relecteur-api »). */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** Fournisseur d'un identifiant de modèle (`anthropic/claude-…` → `anthropic`, `custom:ollama/x` → `custom:ollama`). */
export function providerOf(modelId: string): string {
  const slash = modelId.indexOf('/');
  return slash === -1 ? modelId : modelId.slice(0, slash);
}

/** Renvoie les erreurs de validation par champ (objet vide = valide). */
export function validateAgent(
  agent: EditorAgent,
  { isNew, takenSlugs }: { isNew: boolean; takenSlugs: string[] },
): Partial<Record<keyof EditorAgent, string>> {
  const errors: Partial<Record<keyof EditorAgent, string>> = {};
  if (agent.name.trim().length < 2) errors.name = 'Nom trop court (2 caractères minimum).';
  if (agent.description.trim().length < 2) errors.description = 'Décrivez le rôle de l’agent.';
  if (agent.instructions.trim().length < 10) errors.instructions = 'Instructions trop courtes (10 caractères minimum).';

  const models = agent.models.map((m) => m.trim()).filter(Boolean);
  if (models.length === 0) errors.models = 'Au moins un modèle est requis.';
  else if (models.some((m) => !m.includes('/'))) errors.models = 'Format attendu : fournisseur/modèle.';
  else if (new Set(models).size !== models.length) errors.models = 'Un même modèle apparaît deux fois.';

  if (isNew) {
    if (!SLUG_PATTERN.test(agent.slug)) errors.slug = 'Identifiant : minuscules, chiffres et tirets uniquement.';
    else if (takenSlugs.includes(agent.slug) || agent.slug === 'new') errors.slug = 'Cet identifiant est déjà utilisé.';
  }
  if (!agent.isBuiltin && agent.phases.length === 0) errors.phases = 'Choisissez au moins une phase.';
  if (agent.temperature !== null && (agent.temperature < 0 || agent.temperature > 100)) {
    errors.temperature = 'Température entre 0 et 100 %.';
  }
  return errors;
}

/** Corps envoyé à `PUT /api/agents` (modèles nettoyés). */
export function toPayload(agent: EditorAgent) {
  return { ...agent, models: agent.models.map((m) => m.trim()).filter(Boolean) };
}

/** Déplace l'élément `index` d'un cran (`-1` vers le haut, `1` vers le bas). */
export function move<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

export function sameAgent(a: EditorAgent, b: EditorAgent): boolean {
  return JSON.stringify(toPayload(a)) === JSON.stringify(toPayload(b));
}
