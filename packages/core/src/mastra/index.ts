import { getMastra } from './instance';

/**
 * Point d'entrée pour Mastra Studio (`mastra dev --dir src/mastra`).
 * La CLI Mastra découvre l'instance via l'export `mastra` ; comme ce fichier n'est chargé
 * que par Studio (jamais par `next build`), l'initialisation eager est ici sans risque.
 */
export const mastra = getMastra();

export { getMastra } from './instance';
export { devChainWorkflow, initialChainData } from '../workflows/dev-chain';
