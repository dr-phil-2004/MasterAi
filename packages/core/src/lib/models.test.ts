import { describe, expect, it } from 'vitest';
import { MissingCredentialError, providerOf, resolveModelChain } from './models';

const creds = [
  { provider: 'anthropic', apiKey: 'sk-ant' },
  { provider: 'custom:ollama', apiKey: 'x', baseUrl: 'http://localhost:11434/v1' },
];

describe('palette de modèles', () => {
  it('extrait le fournisseur, y compris custom', () => {
    expect(providerOf('anthropic/claude-opus-5-5')).toBe('anthropic');
    expect(providerOf('custom:ollama/llama3.3')).toBe('custom:ollama');
  });
  it('ignore les modèles sans clé et garde ceux disponibles', () => {
    const chain = resolveModelChain(['openai/gpt-6-sol', 'anthropic/claude-opus-5-5'], creds);
    expect(chain).toHaveLength(1);
    expect(chain[0]!.model).toMatchObject({ id: 'anthropic/claude-opus-5-5', apiKey: 'sk-ant' });
  });
  it('résout un fournisseur custom compatible OpenAI', () => {
    const chain = resolveModelChain(['custom:ollama/llama3.3'], creds);
    expect(chain[0]!.model).toMatchObject({ providerId: 'ollama', modelId: 'llama3.3', url: 'http://localhost:11434/v1' });
  });
  it('fait tourner la chaîne selon le niveau d’escalade', () => {
    const two = [{ provider: 'anthropic', apiKey: 'a' }, { provider: 'openai', apiKey: 'b' }];
    const chain = resolveModelChain(['anthropic/claude-opus-5-5', 'openai/gpt-6-sol'], two, { escalationLevel: 1 });
    expect((chain[0]!.model as { id: string }).id).toBe('openai/gpt-6-sol');
  });
  it('lève une erreur claire sans aucune clé', () => {
    expect(() => resolveModelChain(['anthropic/claude-opus-5-5'], [])).toThrow(MissingCredentialError);
  });
});
