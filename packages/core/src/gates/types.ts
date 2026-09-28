export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export const SEVERITY_ORDER: Record<Severity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export type FindingSource =
  | 'semgrep'
  | 'trivy'
  | 'osv'
  | 'gitleaks'
  | 'nuclei'
  | 'zap'
  | 'review'
  | 'qa'
  | 'lighthouse';

export interface Finding {
  source: FindingSource;
  severity: Severity;
  title: string;
  ruleId?: string;
  location?: string;
  detail?: string;
}

export type CheckId =
  | 'install'
  | 'lint'
  | 'typecheck'
  | 'unit'
  | 'coverage'
  | 'e2e'
  | 'lighthouse'
  | 'accessibility'
  | 'sast'
  | 'dependencies'
  | 'secrets'
  | 'review'
  | 'dast'
  | 'smoke';

export interface CheckResult {
  id: CheckId;
  passed: boolean;
  summary: string;
  /** Extrait de sortie utile au correcteur (tronqué). */
  details?: string;
  findings?: Finding[];
  metrics?: Record<string, number>;
}

export interface QualityPolicy {
  /** Couverture minimale (%) sur lignes, branches, fonctions et instructions. */
  minCoverage: number;
  /** Scores Lighthouse minimaux (0 à 100). */
  minLighthouse: { performance: number; accessibility: number; bestPractices: number; seo: number };
  /** Sévérités de vulnérabilités qui bloquent la mise en production. */
  blockingSeverities: Severity[];
  /** Sévérités de remarques de revue de code qui bloquent la fusion. */
  blockingReviewSeverities: Severity[];
  /** Contrôles obligatoires : un contrôle absent compte comme un échec. */
  requiredChecks: CheckId[];
}

export const DEFAULT_QUALITY_POLICY: QualityPolicy = {
  minCoverage: 90,
  minLighthouse: { performance: 80, accessibility: 90, bestPractices: 90, seo: 80 },
  blockingSeverities: ['high', 'critical'],
  blockingReviewSeverities: ['high', 'critical'],
  requiredChecks: [
    'install',
    'lint',
    'typecheck',
    'unit',
    'coverage',
    'e2e',
    'sast',
    'dependencies',
    'secrets',
    'review',
  ],
};

export interface GateEvaluation {
  passed: boolean;
  failures: CheckResult[];
  /** Empreinte stable des échecs, pour détecter une boucle qui stagne. */
  signature: string;
}
