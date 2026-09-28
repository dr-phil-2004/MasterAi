import { RequestContext } from '@mastra/core/request-context';
import {
  appendRunEvent,
  getDb,
  getProject,
  getRun,
  listIntegrations,
  listProviderCredentials,
  type IntegrationKind,
  type IntegrationSecret,
  type ProviderCredential,
  type RunEvent,
} from '@masterai/db';

/**
 * Contexte d'exécution d'une chaîne.
 * Les secrets (clés API, jetons) restent en mémoire du processus : seul `runId` transite
 * dans le RequestContext de Mastra, qui peut être sérialisé dans les snapshots de workflow.
 */
export interface RunRuntime {
  tenantId: string;
  userId: string;
  projectId: string;
  projectSlug: string;
  runId: string;
  credentials: ProviderCredential[];
  integrations: Partial<Record<IntegrationKind, IntegrationSecret>>;
  /** URL de staging : seule cible autorisée pour le pentest. */
  stagingUrl?: string;
}

export const RUN_ID_KEY = 'masterai.runId';

const runtimes = new Map<string, RunRuntime>();

export function registerRuntime(runtime: RunRuntime): void {
  runtimes.set(runtime.runId, runtime);
}

export function releaseRuntime(runId: string): void {
  runtimes.delete(runId);
}

/** Recharge le contexte depuis la base (après un redémarrage du processus). */
export async function loadRuntime(tenantId: string, runId: string): Promise<RunRuntime> {
  const cached = runtimes.get(runId);
  if (cached) return cached;
  const db = getDb();
  const run = await getRun(db, tenantId, runId);
  if (!run) throw new Error(`Exécution ${runId} introuvable.`);
  const project = await getProject(db, tenantId, run.projectId);
  if (!project) throw new Error(`Projet ${run.projectId} introuvable.`);
  const ctx = { tenantId, userId: project.createdBy };
  const [credentials, integrationList] = await Promise.all([
    listProviderCredentials(db, ctx),
    listIntegrations(db, ctx),
  ]);
  const runtime: RunRuntime = {
    ...ctx,
    projectId: project.id,
    projectSlug: project.slug,
    runId,
    credentials,
    integrations: Object.fromEntries(integrationList.map((i) => [i.kind, i])),
    stagingUrl: project.stagingUrl ?? undefined,
  };
  registerRuntime(runtime);
  return runtime;
}

export function getRuntime(runId: string): RunRuntime {
  const runtime = runtimes.get(runId);
  if (!runtime) throw new Error(`Contexte d'exécution ${runId} non chargé.`);
  return runtime;
}

export function runtimeFromRequestContext(requestContext: RequestContext | undefined): RunRuntime {
  const runId = requestContext?.get(RUN_ID_KEY) as string | undefined;
  if (!runId) throw new Error("Cet outil doit être appelé depuis une exécution MasterAI (runId absent).");
  return getRuntime(runId);
}

export function requestContextFor(runId: string): RequestContext {
  const rc = new RequestContext();
  rc.set(RUN_ID_KEY, runId);
  return rc;
}

export function requireIntegration(runtime: RunRuntime, kind: IntegrationKind): IntegrationSecret & { secret: string } {
  const integration = runtime.integrations[kind];
  if (!integration?.secret) {
    throw new Error(`Intégration « ${kind} » non configurée. Ajoutez-la dans Paramètres → Intégrations.`);
  }
  return integration as IntegrationSecret & { secret: string };
}

/** Journalise une opération (affichée en direct dans l'UI et reprise dans le rapport final). */
export async function emit(
  runId: string,
  phase: string,
  message: string,
  extra: Partial<Pick<RunEvent, 'agent' | 'level' | 'data'>> = {},
): Promise<void> {
  try {
    await appendRunEvent(getDb(), { runId, phase, message, ...extra });
  } catch (error) {
    // Le journal ne doit jamais faire échouer la chaîne.
    console.error('[masterai] journalisation impossible', error);
  }
}
