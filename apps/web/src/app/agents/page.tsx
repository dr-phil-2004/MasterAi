import { loadAgentConfigs, TOOL_DESCRIPTIONS, type ToolId } from '@masterai/core';
import { getSessionContextSafe } from '@/lib/session';
import { SetupNotice } from '@/components/setup-notice';

export const dynamic = 'force-dynamic';

export default async function AgentsPage() {
  const session = await getSessionContextSafe();
  if (!session.ok) {
    return (
      <>
        <div className="page-head">
          <div>
            <h1>Agents</h1>
            <div className="sub">Rôles prédéfinis de la chaîne, modifiables.</div>
          </div>
        </div>
        <SetupNotice reason={session.reason} message={session.message} />
      </>
    );
  }
  const configs = [...(await loadAgentConfigs(session.ctx.tenantId)).values()];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Agents</h1>
          <div className="sub">Rôles prédéfinis de la chaîne, modifiables. Chaque agent a sa palette de modèles.</div>
        </div>
      </div>

      <div className="grid cols-2">
        {configs.map((a) => (
          <div key={a.slug} className="card">
            <div className="row" style={{ paddingTop: 0, borderBottom: 'none' }}>
              <strong>{a.name}</strong>
              <span className="pill">{a.role}</span>
            </div>
            <div className="muted" style={{ fontSize: 13, minHeight: 40 }}>{a.description}</div>
            <div className="stack" style={{ marginTop: 10 }}>
              <div className="muted mono">Modèle : {a.models[0]}</div>
              {a.models.length > 1 && <div className="muted mono">Repli : {a.models.slice(1).join(', ')}</div>}
            </div>
            <div className="pill-list" style={{ marginTop: 10 }}>
              {a.tools.map((t) => (
                <span key={t} className="pill">{TOOL_DESCRIPTIONS[t as ToolId] ?? t}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="muted" style={{ marginTop: 16 }}>
        L’édition des instructions et la création d’agents personnalisés se font via l’API <span className="mono">PUT /api/agents</span>
        {' '}(éditeur visuel prévu pour la prochaine itération).
      </p>
    </>
  );
}
