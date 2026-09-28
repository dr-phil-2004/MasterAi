import { describe, expect, it } from 'vitest';
import { assertAllowedPentestTarget, ForbiddenTargetError } from './target-guard';

describe('garde-fou de cible', () => {
  const staging = 'https://app-staging.vercel.app';
  it('accepte exactement l’hôte de staging', () => {
    expect(assertAllowedPentestTarget('https://app-staging.vercel.app/login', staging).hostname).toBe('app-staging.vercel.app');
  });
  it('refuse tout autre hôte', () => {
    expect(() => assertAllowedPentestTarget('https://example.com', staging)).toThrow(ForbiddenTargetError);
  });
  it('refuse le HTTP non chiffré et l’absence de staging', () => {
    expect(() => assertAllowedPentestTarget('http://app-staging.vercel.app', staging)).toThrow(ForbiddenTargetError);
    expect(() => assertAllowedPentestTarget('https://app-staging.vercel.app', undefined)).toThrow(ForbiddenTargetError);
  });
});
