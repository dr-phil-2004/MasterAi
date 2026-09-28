import { notFound } from 'next/navigation';
import { getDb, getProject, getRun } from '@masterai/db';
import { getSessionContext } from '@/lib/session';
import { RunMonitor } from './monitor';

export const dynamic = 'force-dynamic';

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getSessionContext();
  const db = getDb();
  const run = await getRun(db, ctx.tenantId, id);
  if (!run) notFound();
  const project = await getProject(db, ctx.tenantId, run.projectId);
  if (!project) notFound();

  return <RunMonitor runId={id} initialRun={run} project={project} />;
}
