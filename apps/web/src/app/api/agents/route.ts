import { NextResponse } from 'next/server';
import { z } from 'zod';
import { deleteAgentConfig, getDb, upsertAgentConfig } from '@masterai/db';
import { getBuiltinAgent, loadAgentConfigs, PHASES, TOOL_REGISTRY } from '@masterai/core';
import { sessionOrResponse } from '@/lib/session';

export const runtime = 'nodejs';

export async function GET() {
  const s = await sessionOrResponse();
  if (s instanceof Response) return s;
  const ctx = s;
  const configs = await loadAgentConfigs(ctx.tenantId);
  return NextResponse.json({ agents: [...configs.values()] });
}

const schema = z.object({
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/, 'Identifiant : minuscules, chiffres et tirets uniquement.')
    .max(60)
    .refine((slug) => slug !== 'new', 'Identifiant réservé.'),
  name: z.string().trim().min(2, 'Nom trop court.').max(80),
  description: z.string().trim().min(2, 'Description requise.').max(500),
  instructions: z.string().trim().min(10, 'Instructions trop courtes.').max(50_000),
  models: z
    .array(z.string().trim().regex(/^[^/\s]+\/\S+$/, 'Format de modèle attendu : fournisseur/modèle.'))
    .min(1, 'Au moins un modèle est requis.')
    .max(8),
  tools: z.array(z.enum(Object.keys(TOOL_REGISTRY) as [string, ...string[]])),
  phases: z.array(z.enum(PHASES)),
  temperature: z.number().int().min(0).max(100).nullable().optional(),
  enabled: z.boolean().default(true),
});

/**
 * Crée ou modifie un agent. Le rôle est déduit côté serveur : un identifiant de rôle prédéfini
 * reste ce rôle (ses phases sont fixées par la chaîne) ; tout autre identifiant est un agent personnalisé.
 */
export async function PUT(request: Request) {
  const s = await sessionOrResponse();
  if (s instanceof Response) return s;
  const ctx = s;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { error: first ? `${first.path.join('.') || 'requête'} : ${first.message}` : 'Requête invalide.' },
      { status: 400 },
    );
  }
  const body = parsed.data;
  const builtin = getBuiltinAgent(body.slug);
  if (!builtin && body.phases.length === 0) {
    return NextResponse.json({ error: 'phases : choisissez au moins une phase.' }, { status: 400 });
  }

  const row = await upsertAgentConfig(getDb(), {
    ...body,
    tenantId: ctx.tenantId,
    role: builtin?.role ?? 'custom',
    phases: builtin ? builtin.phases : body.phases,
    isBuiltin: Boolean(builtin),
    temperature: body.temperature ?? null,
  });
  return NextResponse.json({ agent: row });
}

export async function DELETE(request: Request) {
  const s = await sessionOrResponse();
  if (s instanceof Response) return s;
  const ctx = s;
  const slug = new URL(request.url).searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug requis' }, { status: 400 });
  await deleteAgentConfig(getDb(), ctx.tenantId, slug);
  return NextResponse.json({ ok: true });
}
