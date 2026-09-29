import { describe, expect, it } from 'vitest';
import { readJson } from './fetch-json';

describe('readJson', () => {
  it('renvoie le JSON quand le corps est valide', async () => {
    expect(await readJson(new Response('{"runId":"r1"}', { status: 200 }))).toEqual({ runId: 'r1' });
  });
  it('transforme un 500 vide en erreur lisible (au lieu de « Unexpected end of JSON input »)', async () => {
    expect((await readJson(new Response('', { status: 500 }))).error).toBe('Erreur 500 : réponse vide du serveur');
  });
  it('résume un corps texte non JSON', async () => {
    expect((await readJson(new Response('FUNCTION_INVOCATION_FAILED', { status: 500 }))).error).toBe(
      'Erreur 500 : FUNCTION_INVOCATION_FAILED',
    );
  });
  it('explique un 413', async () => {
    expect((await readJson(new Response('Request Entity Too Large', { status: 413 }))).error).toMatch(/trop volumineux/);
  });
  it('renvoie un objet vide pour une réponse OK sans corps', async () => {
    expect(await readJson(new Response(null, { status: 204 }))).toEqual({});
  });
});
