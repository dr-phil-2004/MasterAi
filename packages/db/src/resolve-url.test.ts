import { describe, expect, it } from 'vitest';
import { resolveDatabaseUrl } from './client';

describe('resolveDatabaseUrl', () => {
  it('préfère DATABASE_URL standard', () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: 'a', POSTGRES_URL: 'b' })).toBe('a');
  });
  it('accepte POSTGRES_URL à défaut', () => {
    expect(resolveDatabaseUrl({ POSTGRES_URL: 'b' })).toBe('b');
  });
  it("accepte une variable préfixée par l'intégration Vercel/Neon", () => {
    expect(resolveDatabaseUrl({ masterAi_DATABASE_URL: 'x' } as NodeJS.ProcessEnv)).toBe('x');
  });
  it('préfère la connexion poolée à la non poolée', () => {
    const env = { masterAi_DATABASE_URL_UNPOOLED: 'unpooled', masterAi_POSTGRES_URL: 'pooled' } as NodeJS.ProcessEnv;
    expect(resolveDatabaseUrl(env)).toBe('pooled');
  });
  it('ignore les variables voisines (PRISMA, NO_SSL, HOST…)', () => {
    const env = {
      masterAi_POSTGRES_PRISMA_URL: 'prisma',
      masterAi_POSTGRES_URL_NO_SSL: 'nossl',
      masterAi_PGHOST: 'host',
      masterAi_DATABASE_URL: 'good',
    } as NodeJS.ProcessEnv;
    expect(resolveDatabaseUrl(env)).toBe('good');
  });
  it('renvoie undefined quand rien ne correspond', () => {
    expect(resolveDatabaseUrl({ FOO: 'bar' } as NodeJS.ProcessEnv)).toBeUndefined();
  });
  it('retombe sur la variante non poolée si c’est la seule', () => {
    expect(resolveDatabaseUrl({ POSTGRES_URL_NON_POOLING: 'np' } as NodeJS.ProcessEnv)).toBe('np');
  });
});
