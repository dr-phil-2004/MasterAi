import Link from 'next/link';
import { getDb, listProjects, listRuns } from '@masterai/db';
import { getSessionContextSafe } from '@/lib/session';
import { SetupNotice } from '@/components/setup-notice';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  draft: 'brouillon',
  running: 'en cours',
  staging: 'staging',
  production: 'production',
  failed: 'échec',
  cancelled: 'annulé',
};

export default async function ProjectsPage() {
  const session = await getSessionContextSafe();
  if (!session.ok) {
    return (
      <>
        <div className="page-head">
          <div>
            <h1>Projets</h1>
            <div className="sub">Du cahier des charges à la production, sans intervention humaine.</div>
          </div>
        </div>
        <SetupNotice reason={session.reason} message={session.message} />
      </>
    );
  }
  const db = getDb();
  const [projects, runs] = await Promise.all([listProjects(db, session.ctx.tenantId), listRuns(db, session.ctx.tenantId)]);
  const latestRun = new Map<string, string>();
  for (const run of runs) if (!latestRun.has(run.projectId)) latestRun.set(run.projectId, run.id);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Projets</h1>
          <div className="sub">Du cahier des charges à la production, sans intervention humaine.</div>
        </div>
        <Link href="/projects/new" className="btn">+ Nouveau projet</Link>
      </div>

      {projects.length === 0 ? (
        <div className="card">
          <p className="muted">Aucun projet pour l’instant.</p>
          <Link href="/projects/new" className="btn" style={{ marginTop: 8 }}>Lancer une chaîne</Link>
        </div>
      ) : (
        <div className="grid cols-2">
          {projects.map((p) => {
            const runId = latestRun.get(p.id);
            return (
              <Link key={p.id} href={runId ? `/runs/${runId}` : '/'} className="card">
                <div className="row" style={{ borderBottom: 'none', paddingTop: 0 }}>
                  <strong>{p.name}</strong>
                  <span className={`badge ${p.status}`}>{STATUS_LABEL[p.status] ?? p.status}</span>
                </div>
                <div className="muted" style={{ fontSize: 13 }}>{p.specText?.slice(0, 120)}…</div>
                {p.stagingUrl && <div className="mono" style={{ marginTop: 8 }}>staging : {p.stagingUrl}</div>}
                {p.productionUrl && <div className="mono">prod : {p.productionUrl}</div>}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
