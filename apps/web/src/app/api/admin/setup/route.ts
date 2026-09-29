import { NextResponse } from 'next/server';
import { countAgentConfigs, ensureDefaultTenant, getDb, runMigrations } from '@masterai/db';
import { seedBuiltinAgents } from '@masterai/core';
import { dbConfigured } from '@/lib/session';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * Endpoint d'initialisation : applique le schéma (migrations idempotentes) puis l'amorçage
 * (tenant + agents prédéfinis). Utile quand on ne peut pas lancer `pnpm db:*` en local.
 *
 * Protection : nécessite `SETUP_TOKEN` (variable d'environnement). Le token se passe via
 * le paramètre `?token=` ou l'en-tête `x-setup-token`. Les deux valeurs sont « trim » pour
 * tolérer un espace collé. Sans `SETUP_TOKEN` configuré, l'endpoint est refusé.
 * À appeler une fois : GET/POST /api/admin/setup?token=VOTRE_TOKEN
 */
async function handle(request: Request): Promise<Response> {
  try {
    const expected = process.env.SETUP_TOKEN?.trim();
    if (!expected) {
      return NextResponse.json(
        { error: "SETUP_TOKEN n'est pas défini côté serveur. Ajoutez-le en variable d'environnement, redéployez, puis réessayez." },
        { status: 403 },
      );
    }
    const provided = (new URL(request.url).searchParams.get('token') ?? request.headers.get('x-setup-token') ?? '').trim();
    if (provided !== expected) {
      return NextResponse.json({ error: 'Token invalide.' }, { status: 401 });
    }
    if (!dbConfigured()) {
      return NextResponse.json({ error: "DATABASE_URL n'est pas défini." }, { status: 503 });
    }

    const db = getDb();
    const migration = await runMigrations(db);
    const ctx = await ensureDefaultTenant(db, process.env.MASTERAI_OWNER_EMAIL ?? 'owner@masterai.local');
    await seedBuiltinAgents(ctx.tenantId);
    const agents = await countAgentConfigs(db, ctx.tenantId);

    return NextResponse.json({
      ok: true,
      migration,
      tenantId: ctx.tenantId,
      agents,
      message: 'Base initialisée. Vous pouvez recharger l’application.',
    });
  } catch (error) {
    // On renvoie la cause en JSON plutôt qu'un 500 muet, pour pouvoir diagnostiquer.
    const err = error as { message?: string; code?: string; cause?: { message?: string; code?: string } };
    return NextResponse.json(
      {
        error: "Échec de l'initialisation.",
        detail: err.message ?? String(error),
        cause: err.cause?.message,
        code: err.code ?? err.cause?.code,
      },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
