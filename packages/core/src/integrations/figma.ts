import { MCPClient } from '@mastra/mcp';
import type { RunRuntime } from '../lib/runtime';

const DEFAULT_FIGMA_MCP_URL = 'https://mcp.figma.com/mcp';

/**
 * Outils Figma pour l'agent UX/UI, via le serveur MCP de Figma.
 * Renvoie `undefined` si l'intégration n'est pas configurée : l'agent produit alors
 * des spécifications et des tokens dans le dépôt au lieu de maquettes Figma.
 */
export async function loadFigmaTools(runtime: RunRuntime) {
  const figma = runtime.integrations.figma;
  if (!figma?.secret) return undefined;
  const client = new MCPClient({
    id: `figma-${runtime.runId}`,
    servers: {
      figma: {
        url: new URL(figma.config.mcpUrl || DEFAULT_FIGMA_MCP_URL),
        requestInit: { headers: { Authorization: `Bearer ${figma.secret}` } },
      },
    },
  });
  try {
    return { tools: await client.listTools(), close: () => client.disconnect() };
  } catch (error) {
    await client.disconnect().catch(() => undefined);
    console.warn('[masterai] Figma MCP indisponible, repli sur les spécifications dans le dépôt.', error);
    return undefined;
  }
}
