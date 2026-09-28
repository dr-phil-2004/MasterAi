import { exec, shellQuote } from '../lib/sandbox';
import { requireIntegration, type RunRuntime } from '../lib/runtime';

const API = 'https://api.vercel.com';

function auth(runtime: RunRuntime) {
  const v = requireIntegration(runtime, 'vercel');
  const team = v.config.teamId ? `teamId=${encodeURIComponent(v.config.teamId)}` : '';
  return { token: v.secret, team, teamId: v.config.teamId };
}

async function api<T>(runtime: RunRuntime, method: string, path: string, body?: unknown): Promise<T> {
  const { token, team } = auth(runtime);
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${API}${path}${team ? sep + team : ''}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API Vercel ${method} ${path} : ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

/** Crée (ou récupère) le projet Vercel de l'application générée. */
export async function ensureVercelProject(runtime: RunRuntime, framework = 'nextjs') {
  const name = runtime.projectSlug;
  try {
    return await api<{ id: string; name: string }>(runtime, 'GET', `/v9/projects/${encodeURIComponent(name)}`);
  } catch {
    // Pas de protection SSO sur les previews : le staging doit être joignable par les tests e2e et le pentest.
    return api<{ id: string; name: string }>(runtime, 'POST', '/v11/projects', { name, framework, ssoProtection: null });
  }
}

export async function setEnvVars(
  runtime: RunRuntime,
  projectId: string,
  vars: { key: string; value: string; target: ('production' | 'preview' | 'development')[] }[],
) {
  if (vars.length === 0) return;
  await api(
    runtime,
    'POST',
    `/v10/projects/${projectId}/env?upsert=true`,
    vars.map((v) => ({ ...v, type: 'encrypted' })),
  );
}

async function cli(runtime: RunRuntime, args: string) {
  const { token, teamId } = auth(runtime);
  const scope = teamId ? `--scope ${shellQuote(teamId)}` : '';
  return exec(runtime, `npx --yes vercel@latest ${args} --token "$VERCEL_TOKEN" ${scope} --yes`, {
    env: { VERCEL_TOKEN: token },
    timeoutMs: 30 * 60_000,
  });
}

function lastUrl(output: string): string | undefined {
  return output.match(/https:\/\/[^\s]+\.vercel\.app/g)?.at(-1);
}

/** Déploiement de staging (preview Vercel). */
export async function deployStaging(runtime: RunRuntime, projectName: string) {
  await cli(runtime, `link --project ${shellQuote(projectName)}`);
  const res = await cli(runtime, 'deploy');
  const url = lastUrl(res.stdout);
  if (res.exitCode !== 0 || !url) throw new Error(`Déploiement staging échoué : ${res.stderr.slice(-3000)}`);
  return url;
}

/** Déploiement de production ; renvoie aussi l'URL de production précédente pour un éventuel rollback. */
export async function deployProduction(runtime: RunRuntime, projectName: string) {
  await cli(runtime, `link --project ${shellQuote(projectName)}`);
  const res = await cli(runtime, 'deploy --prod');
  const url = lastUrl(res.stdout);
  if (res.exitCode !== 0 || !url) throw new Error(`Déploiement production échoué : ${res.stderr.slice(-3000)}`);
  return url;
}

export async function rollbackProduction(runtime: RunRuntime) {
  const res = await cli(runtime, 'rollback');
  if (res.exitCode !== 0) throw new Error(`Rollback échoué : ${res.stderr.slice(-2000)}`);
}

/** Contrôle de santé : l'URL doit répondre en 2xx/3xx plusieurs fois de suite. */
export async function healthCheck(url: string, { attempts = 5, delayMs = 5_000, path = '/' } = {}) {
  let ok = 0;
  let lastStatus = 0;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(new URL(path, url), { redirect: 'manual' });
      lastStatus = res.status;
      if (res.status < 400) ok++;
    } catch {
      lastStatus = 0;
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
  }
  return { healthy: ok === attempts, lastStatus };
}
