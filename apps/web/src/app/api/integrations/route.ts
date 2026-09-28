import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb, integrationKind, listIntegrations, upsertIntegration } from '@masterai/db';
import { getSessionContext } from '@/lib/session';

export const runtime = 'nodejs';

export async function GET() {
  const ctx = await getSessionContext();
  const list = await listIntegrations(getDb(), ctx);
  return NextResponse.json({
    integrations: list.map((i) => ({ kind: i.kind, hasSecret: Boolean(i.secret), config: i.config })),
  });
}

const schema = z.object({
  kind: z.enum(integrationKind.enumValues),
  secret: z.string().optional(),
  config: z.record(z.string(), z.string()).default({}),
});

export async function PUT(request: Request) {
  const ctx = await getSessionContext();
  const body = schema.parse(await request.json());
  await upsertIntegration(getDb(), ctx, body);
  return NextResponse.json({ ok: true });
}
