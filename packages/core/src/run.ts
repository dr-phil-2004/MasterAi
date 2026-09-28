import { getDb, updateRun } from '@masterai/db';
import { mastra } from './mastra';
import { devChainWorkflow } from './workflows/dev-chain';
import { initialChainData } from './workflows/dev-chain';
import { releaseRuntime } from './lib/runtime';
import { stopProjectSandbox } from './lib/sandbox';

/**
 * Lance une exécution de la chaîne pour un projet. À appeler en tâche de fond
 * (route API, worker) : ne bloque pas la requête HTTP.
 */
export async function startRun(input: {
  tenantId: string;
  runId: string;
  projectId: string;
  projectName: string;
  specText: string;
  sourceRepo?: string;
}): Promise<void> {
  const workflow = mastra.getWorkflow('devChainWorkflow') ?? devChainWorkflow;
  const run = await workflow.createRun();
  await updateRun(getDb(), input.runId, { workflowRunId: run.runId, status: 'running' });
  try {
    const result = await run.start({ inputData: initialChainData(input) });
    if (result.status !== 'success') {
      await updateRun(getDb(), input.runId, { status: 'failed', finishedAt: new Date() });
    }
  } catch (error) {
    await updateRun(getDb(), input.runId, {
      status: 'failed',
      report: `Erreur d'exécution : ${(error as Error).message}`,
      finishedAt: new Date(),
    });
    throw error;
  } finally {
    await stopProjectSandbox(input.projectId).catch(() => undefined);
    releaseRuntime(input.runId);
  }
}
