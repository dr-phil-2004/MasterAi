// Point d'entrée du paquet cœur : orchestration Mastra, agents, portes qualité et lancement de la chaîne.
// L'instance Mastra est exposée en getter paresseux : l'importer ne doit jamais ouvrir de connexion
// (sinon `next build` casse lors de la collecte des routes). Studio l'obtient via './mastra'.
export { getMastra } from './mastra/instance';
export { devChainWorkflow, initialChainData } from './workflows/dev-chain';
export * from './agents/roles';
export { loadAgentConfigs, studioAgents } from './agents/factory';
export * from './lib/models';
export { registerRuntime, releaseRuntime, loadRuntime, requestContextFor } from './lib/runtime';
export * from './gates/types';
export { evaluateGates } from './gates/evaluate';
export { DEFAULT_LOOP_POLICY, decideNext, initialLoopState, recordIteration } from './gates/loop-policy';
export { TOOL_REGISTRY, TOOL_DESCRIPTIONS, type ToolId } from './tools';
export { startRun } from './run';
export { seedBuiltinAgents } from './seed';
export { pdfToText } from './integrations/pdf';
export { maskSecret } from '@masterai/db';
export type { ChainData } from './workflows/schemas';
