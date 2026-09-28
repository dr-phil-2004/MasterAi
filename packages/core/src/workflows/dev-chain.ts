import { createStep, createWorkflow } from '@mastra/core/workflows';
import { chainSchema, type ChainData } from './schemas';
import {
  analyzeSpec,
  bootstrapProject,
  buildProject,
  codeQualityIteration,
  deployAndVerify,
  planArchitecture,
  writeReport,
} from './steps';

/** Enrobe une fonction (ChainData → ChainData) en étape de workflow. */
function step(id: string, run: (data: ChainData) => Promise<ChainData>) {
  return createStep({ id, inputSchema: chainSchema, outputSchema: chainSchema, execute: ({ inputData }) => run(inputData) });
}

const analyze = step('analyze', analyzeSpec);
const plan = step('plan', planArchitecture);
const bootstrap = step('bootstrap', bootstrapProject);
const build = step('build', buildProject);
/** Corps de boucle : tant que le code n'est pas conforme, corriger. Répété sans limite (détection de stagnation). */
const iterate = step('iterate', codeQualityIteration);
const deploy = step('deploy', deployAndVerify);
const report = step('report', writeReport);

/**
 * Chaîne de développement complète, du cahier des charges à la production.
 * `.dowhile(iterate, …)` boucle tant que `loop.done` est faux : la sortie de production
 * n'est atteinte que lorsque toutes les portes qualité passent ou que la stagnation force l'arrêt.
 */
export const devChainWorkflow = createWorkflow({
  id: 'dev-chain',
  inputSchema: chainSchema,
  outputSchema: chainSchema,
})
  .then(analyze)
  .then(plan)
  .then(bootstrap)
  .then(build)
  .dowhile(iterate, async ({ inputData }) => inputData.loop.done === false)
  .then(deploy)
  .then(report)
  .commit();

export function initialChainData(input: {
  tenantId: string;
  runId: string;
  projectId: string;
  projectName: string;
  specText: string;
  sourceRepo?: string;
}): ChainData {
  return {
    ...input,
    loop: { phase: 'code', iteration: 0, signatures: [], escalationLevel: 0, done: false },
    lastChecks: [],
    operations: [],
    outcome: 'pending',
  };
}
