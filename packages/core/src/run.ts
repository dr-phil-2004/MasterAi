import { getDb, updateProject, updateRun } from '@masterai/db';
import { getMastra } from './mastra/instance';
import { devChainWorkflow, initialChainData } from './workflows/dev-chain';
import { emit, releaseRuntime } from './lib/runtime';
import { stopProjectSandbox } from './lib/sandbox';

/** Message lisible d'une erreur de workflow (Mastra renvoie `result.error` sur un échec d'étape). */
export function failureMessage(error: unknown): string {
  if (!error) return 'La chaîne s’est arrêtée sans message d’erreur.';
  if (typeof error === 'string') return error;
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' && message ? message : String(error);
}

/**
 * Lance une exécution de la chaîne pour un projet. À appeler en tâche de fond
 * (route API avec `after()`, worker) : ne bloque pas la requête HTTP.
 * Toute erreur est journalisée dans le run (visible dans l'UI) ; la promesse ne rejette jamais.
 */
export async function startRun(input: {
  tenantId: string;
  runId: string;
  projectId: string;
  projectName: string;
  specText: string;
  sourceRepo?: string;
}): Promise<void> {
  const db = getDb();
  const fail = async (error: unknown) => {
    const message = failureMessage(error);
    await emit(input.runId, 'report', `Échec de la chaîne : ${message}`, { level: 'error', agent: 'orchestrator' });
    await updateRun(db, input.runId, { status: 'failed', report: `Erreur d'exécution : ${message}`, finishedAt: new Date() });
    await updateProject(db, input.projectId, { status: 'failed' });
  };

  try {
    const workflow = getMastra().getWorkflow('devChainWorkflow') ?? devChainWorkflow;
    const run = await workflow.createRun();
    await updateRun(db, input.runId, { workflowRunId: run.runId, status: 'running', startedAt: new Date() });
    await emit(input.runId, 'analyse', 'Chaîne démarrée', { agent: 'orchestrator' });

    const result = await run.start({ inputData: initialChainData(input) });
    if (result.status !== 'success') {
      await fail('error' in result ? result.error : `statut « ${result.status} »`);
    }
  } catch (error) {
    await fail(error).catch((e) => console.error('[masterai] impossible de journaliser l’échec', e));
    console.error('[masterai] chaîne échouée', error);
  } finally {
    await stopProjectSandbox(input.projectId).catch(() => undefined);
    releaseRuntime(input.runId);
  }
}
