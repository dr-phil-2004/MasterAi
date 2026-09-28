import { describe, expect, it } from 'vitest';
import { coverageCheck, evaluateGates, failureSignature, findingsCheck, lighthouseCheck } from './evaluate';
import { parseCoverageSummary, parseGitleaks, parseLighthouse, parseNuclei, parseOsv, parseSemgrep, parseTrivy, parseZap } from './parsers';
import { DEFAULT_QUALITY_POLICY, type CheckResult } from './types';
import { applyEscalation, decideNext, initialLoopState, recordIteration } from './loop-policy';

const evalOf = (failed: string[]) => ({
  passed: failed.length === 0,
  failures: failed.map((id) => ({ id, passed: false, summary: id }) as CheckResult),
  signature: failed.join(';'),
});

describe('parsers', () => {
  it('lit la couverture Istanbul et compte « Unknown » comme 100 %', () => {
    const raw = JSON.stringify({ total: { lines: { pct: 92.5 }, branches: { pct: 'Unknown' }, functions: { pct: 88 }, statements: { pct: 95 } } });
    expect(parseCoverageSummary(raw)).toEqual({ lines: 92.5, branches: 100, functions: 88, statements: 95 });
  });
  it('renvoie undefined sur un JSON invalide', () => {
    expect(parseCoverageSummary('{bad')).toBeUndefined();
  });
  it('normalise les sévérités Semgrep et Trivy', () => {
    expect(parseSemgrep(JSON.stringify({ results: [{ check_id: 'r', extra: { severity: 'ERROR', message: 'x' } }] }))[0]!.severity).toBe('high');
    expect(parseTrivy(JSON.stringify({ Results: [{ Vulnerabilities: [{ Severity: 'CRITICAL', PkgName: 'p' }] }] }))[0]!.severity).toBe('critical');
  });
  it('marque tout secret Gitleaks comme critique', () => {
    expect(parseGitleaks(JSON.stringify([{ RuleID: 'aws', File: 'a.ts', StartLine: 3 }]))[0]!.severity).toBe('critical');
  });
  it('convertit les scores Lighthouse 0–1 en 0–100', () => {
    const raw = JSON.stringify({ categories: { performance: { score: 0.83 }, accessibility: { score: 0.95 }, 'best-practices': { score: 0.9 }, seo: { score: 0.8 } } });
    expect(parseLighthouse(raw)).toEqual({ performance: 83, accessibility: 95, bestPractices: 90, seo: 80 });
  });
  it('lit OSV-Scanner et mappe la sévérité', () => {
    const raw = JSON.stringify({ results: [{ source: { path: 'pnpm-lock.yaml' }, packages: [{ package: { name: 'lodash' }, vulnerabilities: [{ id: 'GHSA-1', summary: 'proto', database_specific: { severity: 'HIGH' } }] }] }] });
    const f = parseOsv(raw);
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('high');
    expect(f[0]!.location).toBe('pnpm-lock.yaml');
  });
  it('lit Nuclei JSONL en ignorant les lignes vides et invalides', () => {
    const raw = ['{"template-id":"cve","matched-at":"https://x/","info":{"name":"CVE","severity":"critical"}}', '', 'oops'].join('\n');
    const f = parseNuclei(raw);
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('critical');
  });
  it('lit ZAP et convertit le riskcode', () => {
    const raw = JSON.stringify({ site: [{ '@name': 'https://x', alerts: [{ pluginid: '40012', name: 'XSS', riskcode: '3', solution: '<p>échapper</p>' }] }] });
    const f = parseZap(raw);
    expect(f[0]!.severity).toBe('high');
    expect(f[0]!.detail).toBe('échapper');
  });
  it('renvoie une liste vide sur des entrées vides', () => {
    expect(parseSemgrep('')).toEqual([]);
    expect(parseTrivy('{bad')).toEqual([]);
    expect(parseGitleaks('')).toEqual([]);
    expect(parseLighthouse('nope')).toBeUndefined();
  });
});

describe('portes qualité', () => {
  it('échoue si une métrique de couverture est sous le seuil', () => {
    expect(coverageCheck({ lines: 91, branches: 85, functions: 92, statements: 93 }, 90).passed).toBe(false);
    expect(coverageCheck({ lines: 91, branches: 90, functions: 92, statements: 93 }, 90).passed).toBe(true);
  });
  it('ne bloque que sur les sévérités configurées', () => {
    const findings = [{ source: 'trivy', severity: 'medium', title: 'm' } as const];
    expect(findingsCheck('dependencies', findings, ['high', 'critical']).passed).toBe(true);
    expect(findingsCheck('dependencies', [...findings, { source: 'trivy', severity: 'high', title: 'h' }], ['high', 'critical']).passed).toBe(false);
  });
  it('échoue Lighthouse sous les seuils', () => {
    expect(lighthouseCheck({ performance: 85, accessibility: 95, bestPractices: 95, seo: 90 }, DEFAULT_QUALITY_POLICY).passed).toBe(true);
    expect(lighthouseCheck({ performance: 90, accessibility: 80, bestPractices: 95, seo: 90 }, DEFAULT_QUALITY_POLICY).passed).toBe(false);
  });
  it('compte un contrôle obligatoire manquant comme un échec', () => {
    const evalResult = evaluateGates([{ id: 'lint', passed: true, summary: 'ok' }], DEFAULT_QUALITY_POLICY);
    expect(evalResult.passed).toBe(false);
    expect(evalResult.failures.some((f) => f.id === 'coverage')).toBe(true);
  });
  it('produit une empreinte stable indépendante des nombres volatils', () => {
    const a: CheckResult = { id: 'unit', passed: false, summary: '3 tests failed in 12ms' };
    const b: CheckResult = { id: 'unit', passed: false, summary: '7 tests failed in 40ms' };
    expect(failureSignature([a])).toBe(failureSignature([b]));
  });
});

describe('politique de boucle', () => {
  it('boucle sans limite et signale « done » quand tout passe', () => {
    let state = initialLoopState();
    state = recordIteration(state, evalOf(['unit']));
    expect(decideNext(state, evalOf(['unit'])).action).toBe('fix');
    const passing = evalOf([]);
    state = recordIteration(state, passing);
    expect(decideNext(state, passing).action).toBe('done');
  });
  it('escalade après stagnation puis abandonne quand les escalades sont épuisées', () => {
    let state = initialLoopState();
    const ev = evalOf(['e2e']);
    for (let i = 0; i < 3; i++) state = recordIteration(state, ev);
    const decision = decideNext(state, ev);
    expect(decision.action).toBe('escalate');
    if (decision.action === 'escalate') state = applyEscalation(state, decision.escalationLevel);
    state = { ...state, escalationLevel: 3 };
    for (let i = 0; i < 3; i++) state = recordIteration(state, ev);
    expect(decideNext(state, ev).action).toBe('abort');
  });
});
