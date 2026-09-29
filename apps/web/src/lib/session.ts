import { getDb, getDefaultContext, resolveDatabaseUrl, type TenantContext } from '@masterai/db';

/** Vrai si une base de données de plateforme est configurée (tout nom/préfixe DATABASE_URL/POSTGRES_URL). */
export function dbConfigured(): boolean {
  return Boolean(resolveDatabaseUrl());
}

export type SessionResult =
  | { ok: true; ctx: TenantContext }
  | { ok: false; reason: 'no-db' | 'not-seeded'; message: string };

/**
 * Contexte de session, tolérant à une plateforme non configurée (utile pour la preview).
 * En V1 mono-utilisateur, on résout le tenant/utilisateur par défaut. Le typage `TenantContext`
 * est déjà celui du multi-tenant : brancher l'auth ici ne changera pas les couches au-dessus.
 */
export async function getSessionContextSafe(): Promise<SessionResult> {
  if (!dbConfigured()) {
    return { ok: false, reason: 'no-db', message: "La variable d'environnement DATABASE_URL n'est pas définie." };
  }
  try {
    return { ok: true, ctx: await getDefaultContext(getDb()) };
  } catch (error) {
    return { ok: false, reason: 'not-seeded', message: (error as Error).message };
  }
}

/** Variante stricte pour les endroits qui exigent une base (lève une erreur sinon). */
export async function getSessionContext(): Promise<TenantContext> {
  const result = await getSessionContextSafe();
  if (!result.ok) throw new Error(result.message);
  return result.ctx;
}

/**
 * Pour les route handlers : renvoie le contexte, ou une réponse 503 propre si la plateforme
 * n'est pas configurée. Usage : `const s = await sessionOrResponse(); if (s instanceof Response) return s;`
 */
export async function sessionOrResponse(): Promise<TenantContext | Response> {
  const result = await getSessionContextSafe();
  if (result.ok) return result.ctx;
  return Response.json({ error: result.message, setup: true }, { status: 503 });
}
