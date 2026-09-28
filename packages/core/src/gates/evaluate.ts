import type { CoverageTotals, LighthouseScores } from './parsers';
import {
  SEVERITY_ORDER,
  type CheckId,
  type CheckResult,
  type Finding,
  type GateEvaluation,
  type QualityPolicy,
  type Severity,
} from './types';

export function isBlocking(finding: Finding, blocking: Severity[]): boolean {
  return blocking.includes(finding.severity);
}

export function coverageCheck(totals: CoverageTotals | undefined, minCoverage: number): CheckResult {
  if (!totals) {
    return { id: 'coverage', passed: false, summary: 'Rapport de couverture introuvable (coverage/coverage-summary.json).' };
  }
  const entries = Object.entries(totals) as [keyof CoverageTotals, number][];
  const below = entries.filter(([, pct]) => pct < minCoverage);
  return {
    id: 'coverage',
    passed: below.length === 0,
    summary:
      below.length === 0
        ? `Couverture OK (min ${Math.min(...entries.map(([, v]) => v)).toFixed(1)} % ≥ ${minCoverage} %).`
        : `Couverture insuffisante : ${below.map(([k, v]) => `${k} ${v.toFixed(1)} %`).join(', ')} (minimum ${minCoverage} %).`,
    metrics: { ...totals },
  };
}

export function lighthouseCheck(scores: LighthouseScores | undefined, policy: QualityPolicy): CheckResult {
  if (!scores) return { id: 'lighthouse', passed: false, summary: 'Rapport Lighthouse introuvable.' };
  const below = (Object.keys(policy.minLighthouse) as (keyof LighthouseScores)[]).filter(
    (k) => scores[k] < policy.minLighthouse[k],
  );
  return {
    id: 'lighthouse',
    passed: below.length === 0,
    summary:
      below.length === 0
        ? 'Scores Lighthouse conformes.'
        : `Lighthouse sous le seuil : ${below.map((k) => `${k} ${scores[k]}/${policy.minLighthouse[k]}`).join(', ')}.`,
    metrics: { ...scores },
  };
}

/** Transforme une liste de vulnérabilités en contrôle : échoue dès qu'une sévérité bloquante apparaît. */
export function findingsCheck(id: CheckId, findings: Finding[], blocking: Severity[]): CheckResult {
  const blockers = findings.filter((f) => isBlocking(f, blocking));
  const bySeverity = findings.reduce<Record<string, number>>((acc, f) => {
    acc[f.severity] = (acc[f.severity] ?? 0) + 1;
    return acc;
  }, {});
  const counts = Object.entries(bySeverity)
    .sort(([a], [b]) => SEVERITY_ORDER[b as Severity] - SEVERITY_ORDER[a as Severity])
    .map(([s, n]) => `${n} ${s}`)
    .join(', ');
  return {
    id,
    passed: blockers.length === 0,
    summary:
      findings.length === 0
        ? 'Aucun problème détecté.'
        : `${findings.length} problème(s) (${counts}) dont ${blockers.length} bloquant(s).`,
    findings,
  };
}

/** Empreinte des échecs, indépendante de l'ordre et des détails volatils (horodatages, durées). */
export function failureSignature(failures: CheckResult[]): string {
  return failures
    .map((f) => {
      const keys = (f.findings ?? [])
        .map((x) => `${x.source}:${x.ruleId ?? x.title}:${x.location ?? ''}`)
        .sort()
        .join('|');
      return `${f.id}[${keys || f.summary.replace(/\d+(\.\d+)?/g, '#')}]`;
    })
    .sort()
    .join(';');
}

/** Évalue l'ensemble des contrôles au regard de la politique qualité. */
export function evaluateGates(checks: CheckResult[], policy: QualityPolicy): GateEvaluation {
  const byId = new Map(checks.map((c) => [c.id, c]));
  const missing: CheckResult[] = policy.requiredChecks
    .filter((id) => !byId.has(id))
    .map((id) => ({ id, passed: false, summary: `Contrôle obligatoire « ${id} » non exécuté.` }));
  const failures = [...checks.filter((c) => !c.passed), ...missing];
  return { passed: failures.length === 0, failures, signature: failureSignature(failures) };
}
