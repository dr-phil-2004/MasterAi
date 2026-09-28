import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { commitAndPush } from '../integrations/github';
import { runtimeFromRequestContext } from '../lib/runtime';
import { APP_DIR, exec, readFile, shellQuote, tail, writeFiles } from '../lib/sandbox';

/** Commandes interdites aux agents : elles contourneraient les portes qualité ou toucheraient à l'hôte. */
const FORBIDDEN_PATTERNS = [
  /git\s+push\b.*--force/,
  /rm\s+-rf\s+\/(\s|$)/,
  /(^|\s)(nuclei|zap\.sh|zap-baseline|sqlmap|nmap|nikto)\b/, // le pentest passe uniquement par l'étape dédiée
];

export const sandboxExecTool = createTool({
  id: 'sandbox_exec',
  description:
    "Exécute une commande shell dans la sandbox du projet (répertoire de l'application par défaut). Renvoie le code de sortie, stdout et stderr (tronqués).",
  inputSchema: z.object({
    command: z.string().describe('Commande bash, ex. « pnpm test -- --run »'),
    cwd: z.string().optional().describe(`Répertoire de travail, par défaut ${APP_DIR}`),
    timeoutSeconds: z.number().int().min(1).max(3600).optional(),
  }),
  outputSchema: z.object({ exitCode: z.number(), stdout: z.string(), stderr: z.string(), timedOut: z.boolean() }),
  execute: async ({ command, cwd, timeoutSeconds }, { requestContext }) => {
    if (FORBIDDEN_PATTERNS.some((p) => p.test(command))) {
      return { exitCode: 126, stdout: '', stderr: 'Commande refusée par la politique de MasterAI.', timedOut: false };
    }
    const runtime = runtimeFromRequestContext(requestContext);
    const res = await exec(runtime, command, { cwd, timeoutMs: (timeoutSeconds ?? 900) * 1000 });
    return { ...res, stdout: tail(res.stdout), stderr: tail(res.stderr, 6_000) };
  },
});

export const sandboxWriteFilesTool = createTool({
  id: 'sandbox_write_files',
  description: "Crée ou remplace des fichiers (contenu complet) dans le projet. Chemins relatifs à la racine de l'application.",
  inputSchema: z.object({
    files: z.array(z.object({ path: z.string(), content: z.string() })).min(1).max(50),
  }),
  outputSchema: z.object({ written: z.array(z.string()) }),
  execute: async ({ files }, { requestContext }) => {
    const runtime = runtimeFromRequestContext(requestContext);
    if (files.some((f) => f.path.includes('..'))) throw new Error('Chemins avec « .. » interdits.');
    await writeFiles(runtime, files);
    return { written: files.map((f) => f.path) };
  },
});

export const sandboxReadFileTool = createTool({
  id: 'sandbox_read_file',
  description: "Lit un fichier du projet (chemin relatif à la racine de l'application).",
  inputSchema: z.object({ path: z.string() }),
  outputSchema: z.object({ found: z.boolean(), content: z.string() }),
  execute: async ({ path }, { requestContext }) => {
    const runtime = runtimeFromRequestContext(requestContext);
    const content = await readFile(runtime, path.startsWith('/') ? path : `${APP_DIR}/${path}`);
    return { found: content !== undefined, content: tail(content ?? '', 40_000) };
  },
});

export const sandboxListFilesTool = createTool({
  id: 'sandbox_list_files',
  description: 'Liste les fichiers suivis du projet (hors node_modules), éventuellement filtrés par un motif.',
  inputSchema: z.object({ pattern: z.string().optional().describe('Motif grep, ex. « src/.*\\.ts$ »') }),
  outputSchema: z.object({ files: z.array(z.string()) }),
  execute: async ({ pattern }, { requestContext }) => {
    const runtime = runtimeFromRequestContext(requestContext);
    const filter = pattern ? ` | grep -E ${shellQuote(pattern)}` : '';
    const res = await exec(runtime, `git ls-files --cached --others --exclude-standard${filter} | head -2000`);
    return { files: res.stdout.split('\n').filter(Boolean) };
  },
});

export const gitCommitTool = createTool({
  id: 'git_commit',
  description: 'Commite tous les changements sur la branche de travail et les pousse sur GitHub.',
  inputSchema: z.object({
    message: z.string().describe('Message Conventional Commits, ex. « feat(api): add orders endpoint »'),
    branch: z.string().describe('Branche de travail, ex. « masterai/build »'),
  }),
  outputSchema: z.object({ pushed: z.boolean() }),
  execute: async ({ message, branch }, { requestContext }) => {
    if (['main', 'master', 'production'].includes(branch)) {
      throw new Error('Les agents ne poussent jamais directement sur la branche principale.');
    }
    await commitAndPush(runtimeFromRequestContext(requestContext), message, branch);
    return { pushed: true };
  },
});

/** Registre des outils assignables aux agents depuis l'UI. */
export const TOOL_REGISTRY = {
  sandbox_exec: sandboxExecTool,
  sandbox_write_files: sandboxWriteFilesTool,
  sandbox_read_file: sandboxReadFileTool,
  sandbox_list_files: sandboxListFilesTool,
  git_commit: gitCommitTool,
} as const;

export type ToolId = keyof typeof TOOL_REGISTRY;

export const TOOL_DESCRIPTIONS: Record<ToolId, string> = {
  sandbox_exec: 'Exécuter des commandes dans la sandbox Vercel',
  sandbox_write_files: 'Écrire des fichiers',
  sandbox_read_file: 'Lire un fichier',
  sandbox_list_files: 'Lister les fichiers',
  git_commit: 'Commiter et pousser sur GitHub',
};

export function pickTools(ids: string[]) {
  return Object.fromEntries(
    ids.filter((id): id is ToolId => id in TOOL_REGISTRY).map((id) => [id, TOOL_REGISTRY[id]]),
  );
}
