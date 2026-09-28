import { Mastra } from '@mastra/core';
import { PinoLogger } from '@mastra/loggers';
import { PostgresStore } from '@mastra/pg';
import { LibSQLStore } from '@mastra/libsql';
import { studioAgents } from '../agents/factory';
import { devChainWorkflow } from '../workflows/dev-chain';

/** Stockage Mastra (mémoire, snapshots de workflow, traces) : Postgres en production, LibSQL en local. */
function storage() {
  const url = process.env.MASTRA_DATABASE_URL ?? process.env.DATABASE_URL;
  if (url) return new PostgresStore({ id: 'masterai', connectionString: url });
  return new LibSQLStore({ id: 'masterai', url: process.env.MASTRA_LIBSQL_URL ?? 'file:./.mastra/masterai.db' });
}

export const mastra = new Mastra({
  agents: studioAgents(),
  workflows: { devChainWorkflow },
  storage: storage(),
  logger: new PinoLogger({ name: 'MasterAI', level: (process.env.LOG_LEVEL as 'info') ?? 'info' }),
});

export { devChainWorkflow, initialChainData } from '../workflows/dev-chain';
