import { assertAllowedPentestTarget } from '../lib/target-guard';
import type { RunRuntime } from '../lib/runtime';
import { exec, readFile, APP_DIR, shellQuote, tail } from '../lib/sandbox';
import { coverageCheck, findingsCheck, lighthouseCheck } from './evaluate';
import {
  parseCoverageSummary,
  parseGitleaks,
  parseLighthouse,
  parseNuclei,
  parseOsv,
  parseSemgrep,
  parseTrivy,
  parseZap,
} from './parsers';
import type { CheckId, CheckResult, QualityPolicy } from './types';

const TOOLS_DIR = '/vercel/sandbox/.tools';
const PATH_PREFIX = `export PATH=${TOOLS_DIR}/bin:$HOME/.local/bin:$PATH;`;

/** Télécharge le dernier binaire d'une release GitHub dont le nom d'asset correspond au motif. */
const fetchRelease = (repo: string, assetPattern: string, extract: string) => `
url=$(curl -fsSL https://api.github.com/repos/${repo}/releases/latest | grep -o '"browser_download_url": *"[^"]*' | cut -d'"' -f4 | grep -E '${assetPattern}' | head -1)
[ -n "$url" ] && curl -fsSL "$url" -o /tmp/asset && ${extract}`;

/**
 * Installe les scanners dans la sandbox (idempotent). Amazon Linux 2023, x86_64.
 * Semgrep (SAST), Trivy et OSV-Scanner (dépendances), Gitleaks (secrets),
 * Chromium (Playwright/Lighthouse).
 */
export async function installScanners(runtime: RunRuntime): Promise<void> {
  const script = `
set -e
mkdir -p ${TOOLS_DIR}/bin && cd ${TOOLS_DIR}
command -v semgrep >/dev/null || pip3 install --quiet --user semgrep
[ -x bin/trivy ] || curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b ${TOOLS_DIR}/bin
[ -x bin/osv-scanner ] || (curl -fsSL https://github.com/google/osv-scanner/releases/latest/download/osv-scanner_linux_amd64 -o bin/osv-scanner && chmod +x bin/osv-scanner)
[ -x bin/gitleaks ] || (${fetchRelease('gitleaks/gitleaks', 'linux_x64\\.tar\\.gz$', `tar -xzf /tmp/asset -C ${TOOLS_DIR}/bin gitleaks`)})
sudo dnf install -y -q nss atk at-spi2-atk cups-libs libdrm libxkbcommon libXcomposite libXdamage libXrandr mesa-libgbm pango alsa-lib >/dev/null || true
`;
  const res = await exec(runtime, script, { cwd: '/vercel/sandbox', timeoutMs: 20 * 60_000 });
  if (res.exitCode !== 0) throw new Error(`Installation des scanners échouée : ${tail(res.stderr, 3000)}`);
}

async function commandCheck(runtime: RunRuntime, id: CheckId, command: string, timeoutMs = 20 * 60_000): Promise<CheckResult> {
  const res = await exec(runtime, `${PATH_PREFIX} ${command}`, { timeoutMs });
  const ok = res.exitCode === 0 && !res.timedOut;
  return {
    id,
    passed: ok,
    summary: ok ? `« ${command} » réussi.` : `« ${command} » a échoué (code ${res.exitCode}${res.timedOut ? ', délai dépassé' : ''}).`,
    details: ok ? undefined : tail(`${res.stdout}\n${res.stderr}`, 8_000),
  };
}

/** Contrôles sur le code : installation, lint, types, tests + couverture, e2e, SAST, dépendances, secrets. */
export async function runCodeChecks(runtime: RunRuntime, policy: QualityPolicy): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];

  const install = await commandCheck(runtime, 'install', 'pnpm install --frozen-lockfile || pnpm install');
  checks.push(install);
  if (!install.passed) return checks;

  // Lint, types et tests sont indépendants : exécution en parallèle.
  const [lint, typecheck, unit] = await Promise.all([
    commandCheck(runtime, 'lint', 'pnpm lint'),
    commandCheck(runtime, 'typecheck', 'pnpm typecheck'),
    commandCheck(runtime, 'unit', 'rm -rf coverage && pnpm test'),
  ]);
  checks.push(lint, typecheck, unit);

  const summary = await readFile(runtime, `${APP_DIR}/coverage/coverage-summary.json`);
  checks.push(coverageCheck(summary ? parseCoverageSummary(summary) : undefined, policy.minCoverage));

  checks.push(
    await commandCheck(runtime, 'e2e', 'pnpm exec playwright install chromium >/dev/null 2>&1; pnpm test:e2e', 30 * 60_000),
  );

  const scans = await exec(
    runtime,
    `${PATH_PREFIX}
semgrep scan --config auto --json --quiet --metrics off > /tmp/semgrep.json 2>/dev/null || true
trivy fs --scanners vuln --format json --quiet . > /tmp/trivy.json 2>/dev/null || true
osv-scanner scan source --format json -r . > /tmp/osv.json 2>/dev/null || true
gitleaks detect --source . --report-format json --report-path /tmp/gitleaks.json --no-banner --exit-code 0 >/dev/null 2>&1 || true`,
    { timeoutMs: 20 * 60_000 },
  );
  if (scans.exitCode !== 0) console.warn('[masterai] scanners :', scans.stderr);

  const [semgrep, trivy, osv, gitleaks] = await Promise.all(
    ['semgrep', 'trivy', 'osv', 'gitleaks'].map((n) => readFile(runtime, `/tmp/${n}.json`)),
  );
  checks.push(findingsCheck('sast', parseSemgrep(semgrep ?? ''), policy.blockingSeverities));
  checks.push(
    findingsCheck('dependencies', [...parseTrivy(trivy ?? ''), ...parseOsv(osv ?? '')], policy.blockingSeverities),
  );
  checks.push(findingsCheck('secrets', parseGitleaks(gitleaks ?? ''), ['critical']));

  return checks;
}

/**
 * Contrôles sur l'environnement de staging : santé et Lighthouse (si web).
 * Le pentest dynamique n'est pas exécuté ici : il passe par un fournisseur externe
 * configuré par l'utilisateur (voir docs/SECURITY.md), dont le rapport est importé via `importDastReport`.
 */
export async function runStagingChecks(
  runtime: RunRuntime,
  policy: QualityPolicy,
  { stagingUrl, hasWeb }: { stagingUrl: string; hasWeb: boolean },
): Promise<CheckResult[]> {
  const target = assertAllowedPentestTarget(stagingUrl, runtime.stagingUrl).toString();
  const quoted = shellQuote(target);
  const checks: CheckResult[] = [];

  const smoke = await commandCheck(runtime, 'smoke', `curl -fsS -o /dev/null --max-time 30 ${quoted}`);
  checks.push(smoke);
  if (!smoke.passed || !hasWeb) return checks;

  await exec(
    runtime,
    `export CHROME_PATH=$(ls -d $HOME/.cache/ms-playwright/chromium-*/chrome-linux/chrome 2>/dev/null | head -1);
npx --yes lighthouse@latest ${quoted} --output=json --output-path=/tmp/lighthouse.json --quiet --chrome-flags="--headless=new --no-sandbox" || true`,
    { timeoutMs: 10 * 60_000 },
  );
  checks.push(lighthouseCheck(parseLighthouse((await readFile(runtime, '/tmp/lighthouse.json')) ?? ''), policy));
  return checks;
}

/** Importe le rapport JSON d'un outil DAST externe (format ZAP ou Nuclei JSONL) en contrôle bloquant. */
export function importDastReport(raw: string, policy: QualityPolicy): CheckResult {
  const trimmed = raw.trim();
  const findings = trimmed.startsWith('{') ? parseZap(trimmed) : parseNuclei(trimmed);
  return findingsCheck('dast', findings, policy.blockingSeverities);
}
