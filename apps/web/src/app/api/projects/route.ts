import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb, listProjects, projects, runs } from '@masterai/db';
import { pdfToText, startRun } from '@masterai/core';
import { getSessionContext } from '@/lib/session';

export const runtime = 'nodejs';
export const maxDuration = 60;

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || `projet-${Date.now()}`
  );
}

export async function GET() {
  const ctx = await getSessionContext();
  return NextResponse.json({ projects: await listProjects(getDb(), ctx.tenantId) });
}

const schema = z.object({
  name: z.string().min(2),
  specText: z.string().optional(),
  specPdfBase64: z.string().optional(),
  sourceRepo: z.string().regex(/^[\w.-]+\/[\w.-]+$/).optional(),
});

/** Crée un projet, lance la chaîne en tâche de fond et renvoie l'identifiant d'exécution. */
export async function POST(request: Request) {
  const ctx = await getSessionContext();
  const body = schema.parse(await request.json());

  let specText = body.specText?.trim() ?? '';
  if (body.specPdfBase64) {
    const { text } = await pdfToText(Uint8Array.from(Buffer.from(body.specPdfBase64, 'base64')));
    specText = `${specText}\n\n${text}`.trim();
  }
  if (!specText) return NextResponse.json({ error: 'Cahier des charges vide.' }, { status: 400 });

  const db = getDb();
  const slug = `${slugify(body.name)}-${Math.random().toString(36).slice(2, 6)}`;
  const [project] = await db
    .insert(projects)
    .values({ tenantId: ctx.tenantId, createdBy: ctx.userId, name: body.name, slug, specText, sourceRepo: body.sourceRepo })
    .returning();
  const [run] = await db
    .insert(runs)
    .values({ tenantId: ctx.tenantId, projectId: project!.id, status: 'queued' })
    .returning();

  // Exécution asynchrone : on ne bloque pas la requête.
  void startRun({
    tenantId: ctx.tenantId,
    runId: run!.id,
    projectId: project!.id,
    projectName: project!.name,
    specText,
    sourceRepo: body.sourceRepo ?? undefined,
  }).catch((error) => console.error('[masterai] chaîne échouée', error));

  return NextResponse.json({ projectId: project!.id, runId: run!.id });
}
