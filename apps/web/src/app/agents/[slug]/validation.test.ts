import { describe, expect, it } from 'vitest';
import { move, providerOf, sameAgent, slugify, toPayload, validateAgent, type EditorAgent } from './validation';

const base: EditorAgent = {
  slug: 'relecteur-a11y',
  role: 'custom',
  name: 'Relecteur a11y',
  description: 'Vérifie l’accessibilité.',
  instructions: 'Tu vérifies le respect du RGAA.',
  models: ['anthropic/claude-sonnet-5'],
  tools: ['sandbox_read_file'],
  phases: ['review'],
  temperature: null,
  enabled: true,
  isBuiltin: false,
};
const opts = { isNew: true, takenSlugs: ['orchestrator', 'reviewer'] };

describe('validateAgent', () => {
  it('accepte un agent complet', () => {
    expect(validateAgent(base, opts)).toEqual({});
  });
  it('signale les champs trop courts', () => {
    const errors = validateAgent({ ...base, name: 'a', description: '', instructions: 'court' }, opts);
    expect(Object.keys(errors).sort()).toEqual(['description', 'instructions', 'name']);
  });
  it('exige au moins un modèle au format fournisseur/modèle, sans doublon', () => {
    expect(validateAgent({ ...base, models: ['  '] }, opts).models).toMatch(/Au moins un modèle/);
    expect(validateAgent({ ...base, models: ['claude'] }, opts).models).toMatch(/fournisseur\/modèle/);
    expect(validateAgent({ ...base, models: ['a/b', 'a/b'] }, opts).models).toMatch(/deux fois/);
  });
  it('contrôle l’identifiant uniquement à la création', () => {
    expect(validateAgent({ ...base, slug: 'Mauvais Slug' }, opts).slug).toBeDefined();
    expect(validateAgent({ ...base, slug: 'reviewer' }, opts).slug).toMatch(/déjà utilisé/);
    expect(validateAgent({ ...base, slug: 'new' }, opts).slug).toMatch(/déjà utilisé/);
    expect(validateAgent({ ...base, slug: 'reviewer' }, { ...opts, isNew: false }).slug).toBeUndefined();
  });
  it('exige une phase pour un agent personnalisé, pas pour un rôle prédéfini', () => {
    expect(validateAgent({ ...base, phases: [] }, opts).phases).toBeDefined();
    expect(validateAgent({ ...base, phases: [], isBuiltin: true }, { ...opts, isNew: false }).phases).toBeUndefined();
  });
  it('borne la température', () => {
    expect(validateAgent({ ...base, temperature: 120 }, opts).temperature).toBeDefined();
    expect(validateAgent({ ...base, temperature: 40 }, opts).temperature).toBeUndefined();
  });
});

describe('utilitaires', () => {
  it('slugify retire accents et ponctuation', () => {
    expect(slugify('Relecteur Accessibilité (RGAA) !')).toBe('relecteur-accessibilite-rgaa');
  });
  it('providerOf gère les fournisseurs custom', () => {
    expect(providerOf('anthropic/claude-opus-5-5')).toBe('anthropic');
    expect(providerOf('custom:ollama/llama3.3')).toBe('custom:ollama');
  });
  it('move échange deux éléments et ignore les débordements', () => {
    expect(move(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(move(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
  });
  it('toPayload nettoie les modèles vides et sameAgent compare le contenu utile', () => {
    const withBlank = { ...base, models: [' anthropic/claude-sonnet-5 ', ''] };
    expect(toPayload(withBlank).models).toEqual(['anthropic/claude-sonnet-5']);
    expect(sameAgent(withBlank, base)).toBe(true);
    expect(sameAgent({ ...base, name: 'Autre' }, base)).toBe(false);
  });
});
