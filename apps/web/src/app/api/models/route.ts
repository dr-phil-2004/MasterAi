import { NextResponse } from 'next/server';
import { z } from 'zod';
import { deleteProviderCredential, getDb, listProviderCredentials, upsertProviderCredential } from '@masterai/db';
import { listPalette, maskSecret } from '@masterai/core';
import { getSessionContext } from '@/lib/session';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const ctx = await getSessionContext();
  const all = new URL(request.url).searchParams.get('all') === '1';
  const credentials = await listProviderCredentials(getDb(), ctx);
  return NextResponse.json({
    palette: listPalette(credentials, { all }),
    configured: credentials.map((c) => ({ provider: c.provider, masked: c.apiKey ? maskSecret(c.apiKey) : null, baseUrl: c.baseUrl })),
  });
}

const schema = z.object({ provider: z.string(), apiKey: z.string().optional(), baseUrl: z.string().url().optional() });

export async function PUT(request: Request) {
  const ctx = await getSessionContext();
  const body = schema.parse(await request.json());
  await upsertProviderCredential(getDb(), ctx, body);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const ctx = await getSessionContext();
  const provider = new URL(request.url).searchParams.get('provider');
  if (!provider) return NextResponse.json({ error: 'provider requis' }, { status: 400 });
  await deleteProviderCredential(getDb(), ctx, provider);
  return NextResponse.json({ ok: true });
}
