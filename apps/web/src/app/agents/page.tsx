import Link from 'next/link';
import { loadAgentConfigs, TOOL_DESCRIPTIONS, type ToolId } from '@masterai/core';
import { getSessionContextSafe } from '@/lib/session';
import { SetupNotice } from '@/components/setup-notice';

export const dynamic = 'force-dynamic';

export default async function AgentsPage() {
  const session = await getSessionContextSafe();
  const head = (
    <div className="page-head">
      <div>
        <h1>Agents</h1>
        <div className="sub">Rôles prédéfinis de la chaîne (modifiables) et agents personnalisés.</div>
      </div>
      {session.ok && (
        <Link href="/agents/new" className="btn">
          + Nouvel agent
        </Link>
      )}
    </div>
  );
  if (!session.ok) {
    return (
      <>
        {head}
        <SetupNotice reason={session.reason} message={session.message} />
      </>
    );
  }

  const configs = [...(await loadAgentConfigs(session.ctx.tenantId)).values()];

  return (
    <>
      {head}
      <div className="grid cols-2">
        {configs.map((a) => (
          <Link key={a.slug} href={`/agents/${a.slug}`} className="card agent-card">
            <div className="row" style={{ paddingTop: 0, borderBottom: 'none' }}>
              <strong>{a.name}</strong>
              <span className="pill-list">
                {!a.enabled && <span className="badge failed">désactivé</span>}
                <span className="pill">{a.role === 'custom' ? 'personnalisé' : a.role}</span>
              </span>
            </div>
            <div className="muted" style={{ fontSize: 13, minHeight: 40 }}>{a.description}</div>
            <div className="stack" style={{ marginTop: 10 }}>
              <div className="muted mono">Modèle : {a.models[0] ?? '—'}</div>
              {a.models.length > 1 && <div className="muted mono">Repli : {a.models.slice(1).join(', ')}</div>}
            </div>
            <div className="pill-list" style={{ marginTop: 10 }}>
              {a.tools.map((t) => (
                <span key={t} className="pill">{TOOL_DESCRIPTIONS[t as ToolId] ?? t}</span>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
