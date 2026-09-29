'use client';

import { useEffect, useRef, useState } from 'react';
import type { Project, Run, RunEvent } from '@masterai/db';

const PHASES = [
  ['analyse', 'Analyse'],
  ['architecture', 'Architecture'],
  ['design', 'Design'],
  ['setup', 'Dépôt & BDD'],
  ['build', 'Développement'],
  ['review', 'Revue & QA'],
  ['security', 'Sécurité'],
  ['deploy', 'Déploiement'],
  ['report', 'Rapport'],
] as const;

export function RunMonitor({ runId, initialRun, project }: { runId: string; initialRun: Run; project: Project }) {
  const [run, setRun] = useState<Run>(initialRun);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const source = new EventSource(`/api/runs/${runId}/events`);
    // Une reconnexion automatique d'EventSource rejoue l'historique : on dédoublonne par identifiant.
    source.addEventListener('log', (e) => {
      const event = JSON.parse((e as MessageEvent).data) as RunEvent;
      setEvents((prev) => (prev.some((x) => x.id === event.id) ? prev : [...prev, event]));
    });
    source.addEventListener('run', (e) => setRun(JSON.parse((e as MessageEvent).data)));
    source.addEventListener('done', () => source.close());
    return () => source.close();
  }, [runId]);

  useEffect(() => bottom.current?.scrollIntoView({ behavior: 'smooth' }), [events.length]);

  const currentPhaseIndex = PHASES.findIndex(([p]) => p === run.phase);
  const finished = ['succeeded', 'failed', 'cancelled'].includes(run.status);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{project.name}</h1>
          <div className="sub">
            {run.status === 'running' ? `En cours — ${run.phase ?? '…'}` : run.status} · itération {run.iteration}
          </div>
        </div>
        <span className={`badge ${run.status === 'running' ? 'running' : run.status}`}>{run.status}</span>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="pill-list">
          {PHASES.map(([id, label], i) => {
            const done = currentPhaseIndex > i || (finished && run.status === 'succeeded');
            const active = run.phase === id && !finished;
            return (
              <span
                key={id}
                className="pill"
                style={{
                  borderColor: active ? 'var(--accent)' : done ? 'var(--success)' : 'var(--border)',
                  color: active ? 'var(--accent)' : done ? 'var(--success)' : 'var(--muted)',
                }}
              >
                {done ? '✓ ' : active ? '● ' : ''}
                {label}
              </span>
            );
          })}
        </div>
        {(project.stagingUrl || project.productionUrl || project.repoUrl) && (
          <div className="stack" style={{ marginTop: 14 }}>
            {project.repoUrl && <a className="mono" href={project.repoUrl}>Dépôt : {project.repoUrl}</a>}
            {project.stagingUrl && <a className="mono" href={project.stagingUrl}>Staging : {project.stagingUrl}</a>}
            {project.productionUrl && <a className="mono" href={project.productionUrl}>Production : {project.productionUrl}</a>}
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ margin: 0 }}>Journal en direct</h2>
        </div>
        <div style={{ maxHeight: 460, overflowY: 'auto' }}>
          {events.length === 0 && <div className="muted" style={{ padding: 16 }}>En attente des premières opérations…</div>}
          {events.map((e) => (
            <div key={e.id} className={`event ${e.level}`}>
              <span className="phase">{e.phase}</span>
              <span className="agent">{e.agent ?? '—'}</span>
              <span className="msg">{e.message}</span>
            </div>
          ))}
          <div ref={bottom} />
        </div>
      </div>

      {run.report && (
        <div className="card" style={{ marginTop: 16, borderColor: run.status === 'failed' ? 'var(--error)' : undefined }}>
          <h2>{run.status === 'failed' ? 'Cause de l’échec' : 'Rapport final'}</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--mono)', fontSize: 13 }}>{run.report}</pre>
        </div>
      )}
    </>
  );
}
