import { notFound } from 'next/navigation';
import { getDb, getProject, getRun } from '@masterai/db';
import { getSessionContextSafe } from '@/lib/session';
import { SetupNotice } from '@/components/setup-notice';
import { RunMonitor } from './monitor';

export const dynamic = 'force-dynamic';

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionContextSafe();
  if (!session.ok) return <SetupNotice reason={session.reason} message={session.message} />;
  const db = getDb();
  const run = await getRun(db, session.ctx.tenantId, id);
  if (!run) notFound();
  const project = await getProject(db, session.ctx.tenantId, run.projectId);
  if (!project) notFound();

  return <RunMonitor runId={id} initialRun={run} project={project} />;
}
