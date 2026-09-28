import { NextResponse } from 'next/server';
import { z } from 'zod';
import { deleteAgentConfig, getDb, upsertAgentConfig } from '@masterai/db';
import { loadAgentConfigs } from '@masterai/core';
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
  slug: z.string().regex(/^[a-z0-9-]+$/),
  role: z.string(),
  name: z.string().min(2),
  description: z.string().min(2),
  instructions: z.string().min(10),
  models: z.array(z.string()).min(1),
  tools: z.array(z.string()),
  phases: z.array(z.string()),
  temperature: z.number().min(0).max(100).nullable().optional(),
  enabled: z.boolean().default(true),
  isBuiltin: z.boolean().default(false),
});

/** Crée ou modifie un agent (rôle prédéfini modifié, ou agent personnalisé). */
export async function PUT(request: Request) {
  const s = await sessionOrResponse();
  if (s instanceof Response) return s;
  const ctx = s;
  const body = schema.parse(await request.json());
  const row = await upsertAgentConfig(getDb(), { ...body, tenantId: ctx.tenantId, temperature: body.temperature ?? null });
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
