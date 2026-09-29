import { Mastra } from '@mastra/core';
import { PinoLogger } from '@mastra/loggers';
import { PostgresStore } from '@mastra/pg';
import { LibSQLStore } from '@mastra/libsql';
import { resolveDatabaseUrl } from '@masterai/db';
import { studioAgents } from '../agents/factory';
import { devChainWorkflow } from '../workflows/dev-chain';

/**
 * Stockage Mastra (mémoire, snapshots de workflow, traces) : Postgres en production, LibSQL en local.
 * Construit uniquement à l'appel : ouvrir la connexion au moment de l'import casserait
 * `next build` (collecte des routes) là où aucune base n'est disponible.
 */
function storage() {
  const url = process.env.MASTRA_DATABASE_URL ?? resolveDatabaseUrl();
  if (url) return new PostgresStore({ id: 'masterai', connectionString: url });
  return new LibSQLStore({ id: 'masterai', url: process.env.MASTRA_LIBSQL_URL ?? 'file:./.mastra/masterai.db' });
}

let instance: Mastra | undefined;

/** Singleton Mastra, initialisé paresseusement au premier usage (jamais à l'import du module). */
export function getMastra(): Mastra {
  if (!instance) {
    instance = new Mastra({
      agents: studioAgents(),
      workflows: { devChainWorkflow },
      storage: storage(),
      logger: new PinoLogger({ name: 'MasterAI', level: (process.env.LOG_LEVEL as 'info') ?? 'info' }),
    });
  }
  return instance;
}
