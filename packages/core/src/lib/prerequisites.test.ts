import { describe, expect, it } from 'vitest';
import type { IntegrationSecret } from '@masterai/db';
import { checkRunPrerequisites } from './prerequisites';

const complete: IntegrationSecret[] = [
  { kind: 'github', secret: 'ghp', config: {} },
  { kind: 'vercel', secret: 'vc', config: { sandboxProjectId: 'prj_1' } },
  { kind: 'neon', secret: 'neon', config: {} },
];

describe('checkRunPrerequisites', () => {
  it('ne signale rien quand tout est configuré', () => {
    expect(checkRunPrerequisites([{ provider: 'anthropic', apiKey: 'sk' }], complete)).toEqual([]);
  });

  it('liste tout ce qui manque sur une installation vierge', () => {
    expect(checkRunPrerequisites([], []).map((m) => m.id)).toEqual(['model', 'github', 'vercel', 'neon']);
  });

  it('accepte un fournisseur compatible OpenAI sans clé mais avec URL', () => {
    const ids = checkRunPrerequisites([{ provider: 'custom:ollama', baseUrl: 'http://localhost:11434/v1' }], complete);
    expect(ids).toEqual([]);
  });

  it('ignore un fournisseur enregistré sans clé', () => {
    expect(checkRunPrerequisites([{ provider: 'openai' }], complete).map((m) => m.id)).toEqual(['model']);
  });

  it('exige le projet Vercel des sandboxes quand le jeton est présent', () => {
    const withoutSandbox = complete.map((i) => (i.kind === 'vercel' ? { ...i, config: {} } : i));
    expect(checkRunPrerequisites([{ provider: 'anthropic', apiKey: 'sk' }], withoutSandbox).map((m) => m.id)).toEqual([
      'vercel-sandbox',
    ]);
  });
});
