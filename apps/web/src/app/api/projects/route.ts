import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb, listIntegrations, listProjects, listProviderCredentials, projects, runs } from '@masterai/db';
import { checkRunPrerequisites, pdfToText, startRun } from '@masterai/core';
import { sessionOrResponse } from '@/lib/session';

export const runtime = 'nodejs';
// La chaîne continue après la réponse via `after()` : elle dispose de toute la durée de la fonction.
export const maxDuration = 300;

/** Taille maximale d'un PDF encodé (Vercel limite le corps d'une requête à 4,5 Mo). */
const MAX_PDF_BASE64 = 4_000_000;

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

/** Accepte `owner/repo` ou une URL GitHub complète, et renvoie `owner/repo`. */
function normalizeRepo(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '');
}

export async function GET() {
  const s = await sessionOrResponse();
  if (s instanceof Response) return s;
  return NextResponse.json({ projects: await listProjects(getDb(), s.tenantId) });
}

const schema = z.object({
  name: z.string().trim().min(2, 'Le nom du projet doit faire au moins 2 caractères.').max(80),
  specText: z.string().max(200_000).optional(),
  specPdfBase64: z.string().max(MAX_PDF_BASE64, 'PDF trop volumineux (3 Mo maximum).').optional(),
  sourceRepo: z
    .string()
    .optional()
    .transform(normalizeRepo)
    .refine((repo) => !repo || /^[\w.-]+\/[\w.-]+$/.test(repo), 'Dépôt attendu au format owner/repo.'),
});

/** Crée un projet, lance la chaîne en tâche de fond et renvoie l'identifiant d'exécution. */
export async function POST(request: Request) {
  try {
    const s = await sessionOrResponse();
    if (s instanceof Response) return s;
    const ctx = s;

    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Requête invalide.' }, { status: 400 });
    }
    const body = parsed.data;
    const db = getDb();

    // Refuser tout de suite s'il manque de quoi exécuter la chaîne.
    const [credentials, integrations] = await Promise.all([listProviderCredentials(db, ctx), listIntegrations(db, ctx)]);
    const missing = checkRunPrerequisites(credentials, integrations);
    if (missing.length > 0) {
      return NextResponse.json(
        { error: 'Configuration incomplète : la chaîne ne peut pas démarrer.', missing },
        { status: 422 },
      );
    }

    let specText = body.specText?.trim() ?? '';
    if (body.specPdfBase64) {
      try {
        const { text } = await pdfToText(Uint8Array.from(Buffer.from(body.specPdfBase64, 'base64')));
        specText = `${specText}\n\n${text}`.trim();
      } catch (error) {
        return NextResponse.json(
          { error: `Lecture du PDF impossible : ${(error as Error).message}. Collez le texte du cahier des charges.` },
          { status: 400 },
        );
      }
    }
    if (!specText) {
      return NextResponse.json({ error: 'Cahier des charges vide : ajoutez un PDF lisible ou du texte.' }, { status: 400 });
    }

    const slug = `${slugify(body.name)}-${Math.random().toString(36).slice(2, 6)}`;
    const [project] = await db
      .insert(projects)
      .values({ tenantId: ctx.tenantId, createdBy: ctx.userId, name: body.name, slug, specText, sourceRepo: body.sourceRepo })
      .returning();
    const [run] = await db.insert(runs).values({ tenantId: ctx.tenantId, projectId: project!.id, status: 'queued' }).returning();

    // `after()` garde la fonction en vie après la réponse (sur Vercel, une promesse « flottante » serait gelée).
    after(() =>
      startRun({
        tenantId: ctx.tenantId,
        runId: run!.id,
        projectId: project!.id,
        projectName: project!.name,
        specText,
        sourceRepo: body.sourceRepo,
      }),
    );

    return NextResponse.json({ projectId: project!.id, runId: run!.id });
  } catch (error) {
    console.error('[masterai] création de projet impossible', error);
    return NextResponse.json(
      { error: `Création du projet impossible : ${(error as Error).message ?? String(error)}` },
      { status: 500 },
    );
  }
}
