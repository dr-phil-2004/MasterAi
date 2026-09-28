import type { Finding, Severity } from './types';

/**
 * Analyseurs des sorties JSON des outils exécutés dans la sandbox.
 * Chaque fonction tolère une sortie vide ou invalide et renvoie alors une liste vide.
 */

function safeJson<T>(raw: string): T | undefined {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function normalizeSeverity(raw: string | undefined): Severity {
  switch ((raw ?? '').toLowerCase()) {
    case 'critical':
      return 'critical';
    case 'high':
    case 'error':
      return 'high';
    case 'medium':
    case 'moderate':
    case 'warning':
      return 'medium';
    case 'low':
      return 'low';
    default:
      return 'info';
  }
}

export interface CoverageTotals {
  lines: number;
  statements: number;
  functions: number;
  branches: number;
}

/** `coverage/coverage-summary.json` (Istanbul, produit par Vitest/Jest avec le reporter `json-summary`). */
export function parseCoverageSummary(raw: string): CoverageTotals | undefined {
  const json = safeJson<{ total?: Record<string, { pct?: number | string }> }>(raw);
  const total = json?.total;
  if (!total) return undefined;
  const pct = (key: string) => {
    const value = total[key]?.pct;
    // Istanbul écrit "Unknown" quand il n'y a rien à couvrir : on le compte comme 100 %.
    return typeof value === 'number' ? value : 100;
  };
  return {
    lines: pct('lines'),
    statements: pct('statements'),
    functions: pct('functions'),
    branches: pct('branches'),
  };
}

/** `semgrep --json` */
export function parseSemgrep(raw: string): Finding[] {
  const json = safeJson<{
    results?: { check_id?: string; path?: string; start?: { line?: number }; extra?: { severity?: string; message?: string } }[];
  }>(raw);
  return (json?.results ?? []).map((r) => ({
    source: 'semgrep',
    severity: normalizeSeverity(r.extra?.severity),
    title: r.extra?.message?.split('\n')[0] ?? r.check_id ?? 'Règle Semgrep',
    ruleId: r.check_id,
    location: r.path ? `${r.path}:${r.start?.line ?? 0}` : undefined,
  }));
}

/** `trivy fs --format json` */
export function parseTrivy(raw: string): Finding[] {
  const json = safeJson<{
    Results?: {
      Target?: string;
      Vulnerabilities?: { VulnerabilityID?: string; PkgName?: string; Severity?: string; Title?: string; FixedVersion?: string }[];
    }[];
  }>(raw);
  return (json?.Results ?? []).flatMap((result) =>
    (result.Vulnerabilities ?? []).map((v) => ({
      source: 'trivy' as const,
      severity: normalizeSeverity(v.Severity),
      title: `${v.PkgName ?? '?'} : ${v.Title ?? v.VulnerabilityID ?? 'vulnérabilité'}`,
      ruleId: v.VulnerabilityID,
      location: result.Target,
      detail: v.FixedVersion ? `Corrigé en ${v.FixedVersion}` : undefined,
    })),
  );
}

/** `gitleaks detect --report-format json` : tout secret exposé est critique. */
export function parseGitleaks(raw: string): Finding[] {
  const json = safeJson<{ RuleID?: string; Description?: string; File?: string; StartLine?: number }[]>(raw);
  return (Array.isArray(json) ? json : []).map((l) => ({
    source: 'gitleaks',
    severity: 'critical',
    title: l.Description ?? 'Secret exposé',
    ruleId: l.RuleID,
    location: l.File ? `${l.File}:${l.StartLine ?? 0}` : undefined,
  }));
}

/** `nuclei -jsonl` : une ligne JSON par résultat. */
export function parseNuclei(raw: string): Finding[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => safeJson<{ 'template-id'?: string; 'matched-at'?: string; info?: { name?: string; severity?: string } }>(line))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((r) => ({
      source: 'nuclei',
      severity: normalizeSeverity(r.info?.severity),
      title: r.info?.name ?? r['template-id'] ?? 'Résultat Nuclei',
      ruleId: r['template-id'],
      location: r['matched-at'],
    }));
}

/** Rapport JSON d'OWASP ZAP (`-quickout report.json` ou `zap-baseline -J`). */
export function parseZap(raw: string): Finding[] {
  const json = safeJson<{
    site?: { '@name'?: string; alerts?: { pluginid?: string; name?: string; alert?: string; riskcode?: string; solution?: string }[] }[];
  }>(raw);
  const risk: Record<string, Severity> = { '0': 'info', '1': 'low', '2': 'medium', '3': 'high' };
  return (json?.site ?? []).flatMap((site) =>
    (site.alerts ?? []).map((a) => ({
      source: 'zap' as const,
      severity: risk[a.riskcode ?? '0'] ?? 'info',
      title: a.name ?? a.alert ?? 'Alerte ZAP',
      ruleId: a.pluginid,
      location: site['@name'],
      detail: a.solution?.replace(/<[^>]+>/g, '').slice(0, 300),
    })),
  );
}

/** `osv-scanner --format json` */
export function parseOsv(raw: string): Finding[] {
  const json = safeJson<{
    results?: {
      source?: { path?: string };
      packages?: {
        package?: { name?: string };
        vulnerabilities?: { id?: string; summary?: string; database_specific?: { severity?: string } }[];
      }[];
    }[];
  }>(raw);
  return (json?.results ?? []).flatMap((result) =>
    (result.packages ?? []).flatMap((pkg) =>
      (pkg.vulnerabilities ?? []).map((v) => ({
        source: 'osv' as const,
        severity: normalizeSeverity(v.database_specific?.severity),
        title: `${pkg.package?.name ?? '?'} : ${v.summary ?? v.id ?? 'vulnérabilité'}`,
        ruleId: v.id,
        location: result.source?.path,
      })),
    ),
  );
}

export interface LighthouseScores {
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
}

/** Rapport JSON de Lighthouse : scores de 0 à 1 convertis en 0 à 100. */
export function parseLighthouse(raw: string): LighthouseScores | undefined {
  const json = safeJson<{ categories?: Record<string, { score?: number | null }> }>(raw);
  const c = json?.categories;
  if (!c) return undefined;
  const score = (key: string) => Math.round((c[key]?.score ?? 0) * 100);
  return {
    performance: score('performance'),
    accessibility: score('accessibility'),
    bestPractices: score('best-practices'),
    seo: score('seo'),
  };
}
