import { getDb, getDefaultContext, type TenantContext } from '@masterai/db';

/**
 * Contexte de session. En V1 mono-utilisateur, on résout le tenant/utilisateur par défaut.
 * Le typage `TenantContext` est déjà celui du multi-tenant : brancher l'auth ici ne changera
 * pas les couches au-dessus.
 */
export async function getSessionContext(): Promise<TenantContext> {
  return getDefaultContext(getDb());
}
