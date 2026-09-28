import { VercelSandbox } from '@mastra/vercel';
import { requireIntegration, type RunRuntime } from './runtime';

/** Répertoire de travail du projet dans la sandbox. */
export const APP_DIR = '/vercel/sandbox/app';

const sandboxes = new Map<string, Promise<VercelSandbox>>();

/**
 * Une sandbox Vercel nommée par projet : son système de fichiers persiste entre deux démarrages
 * (arrêt par snapshot), et le code est de toute façon poussé sur GitHub à chaque étape.
 * Authentification avec le jeton Vercel de l'utilisateur ; `sandboxProjectId` désigne le projet
 * Vercel auquel la sandbox est facturée.
 */
export function getProjectSandbox(runtime: RunRuntime): Promise<VercelSandbox> {
  const key = runtime.projectId;
  let pending = sandboxes.get(key);
  if (!pending) {
    pending = (async () => {
      const vercel = requireIntegration(runtime, 'vercel');
      const sandbox = new VercelSandbox({
        sandboxName: `masterai-${runtime.projectSlug}`.slice(0, 60),
        token: vercel.secret,
        teamId: vercel.config.teamId,
        projectId: vercel.config.sandboxProjectId,
        runtime: 'node24',
        timeout: 45 * 60_000,
        resources: { vcpus: 4 },
        // 3000 : app en staging local pour les tests e2e/Lighthouse.
        ports: [3000],
        env: { CI: '1', NEXT_TELEMETRY_DISABLED: '1' },
      });
      await sandbox.start();
      return sandbox;
    })();
    sandboxes.set(key, pending);
    pending.catch(() => sandboxes.delete(key));
  }
  return pending;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/** Tronque une sortie en gardant la fin, généralement la plus utile (erreurs). */
export function tail(text: string, max = 12_000): string {
  return text.length <= max ? text : `…[${text.length - max} caractères tronqués]\n${text.slice(-max)}`;
}

export async function exec(
  runtime: RunRuntime,
  command: string,
  { cwd = APP_DIR, timeoutMs = 15 * 60_000, env }: { cwd?: string; timeoutMs?: number; env?: Record<string, string> } = {},
): Promise<ExecResult> {
  const sandbox = await getProjectSandbox(runtime);
  const result = await sandbox.executeCommand('bash', ['-lc', command], {
    cwd,
    timeout: timeoutMs,
    env: env as NodeJS.ProcessEnv | undefined,
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    timedOut: Boolean(result.timedOut),
  };
}

export async function writeFiles(runtime: RunRuntime, files: { path: string; content: string }[]): Promise<void> {
  const sandbox = await getProjectSandbox(runtime);
  await sandbox.writeFiles(
    files.map((f) => ({ path: f.path.startsWith('/') ? f.path : `${APP_DIR}/${f.path}`, content: f.content })),
  );
}

export async function readFile(runtime: RunRuntime, path: string): Promise<string | undefined> {
  const res = await exec(runtime, `cat -- ${shellQuote(path)}`);
  return res.exitCode === 0 ? res.stdout : undefined;
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export async function stopProjectSandbox(projectId: string): Promise<void> {
  const pending = sandboxes.get(projectId);
  sandboxes.delete(projectId);
  if (pending) await (await pending).stop().catch(() => undefined);
}
