'use client';

import { useEffect, useState } from 'react';

interface IntegrationView {
  kind: string;
  hasSecret: boolean;
  config: Record<string, string>;
}

const CATALOG: { kind: string; name: string; secretLabel: string; fields: { key: string; label: string }[]; required: boolean }[] = [
  { kind: 'github', name: 'GitHub', secretLabel: 'Jeton (repo, workflow)', fields: [{ key: 'owner', label: 'Organisation (optionnel)' }], required: true },
  { kind: 'vercel', name: 'Vercel', secretLabel: 'Jeton Vercel', fields: [{ key: 'teamId', label: 'Team ID' }, { key: 'sandboxProjectId', label: 'Projet pour les sandboxes' }], required: true },
  { kind: 'neon', name: 'Neon (PostgreSQL)', secretLabel: 'Clé API', fields: [{ key: 'regionId', label: 'Région (ex. aws-eu-central-1)' }], required: true },
  { kind: 'figma', name: 'Figma', secretLabel: 'Jeton Figma', fields: [{ key: 'mcpUrl', label: 'URL du MCP (optionnel)' }], required: false },
  { kind: 'slack', name: 'Slack', secretLabel: 'URL du webhook entrant', fields: [], required: false },
  { kind: 'email', name: 'E-mail (Resend)', secretLabel: 'Clé API Resend', fields: [{ key: 'to', label: 'Destinataires' }, { key: 'from', label: 'Expéditeur' }], required: false },
];

export default function IntegrationsPage() {
  const [items, setItems] = useState<IntegrationView[]>([]);
  const [draft, setDraft] = useState<Record<string, { secret: string; config: Record<string, string> }>>({});

  async function load() {
    const res = await fetch('/api/integrations');
    setItems((await res.json()).integrations);
  }
  useEffect(() => {
    void load();
  }, []);

  const state = new Map(items.map((i) => [i.kind, i]));

  async function save(kind: string) {
    const d = draft[kind] ?? { secret: '', config: {} };
    await fetch('/api/integrations', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, secret: d.secret || undefined, config: { ...state.get(kind)?.config, ...d.config } }),
    });
    setDraft((x) => ({ ...x, [kind]: { secret: '', config: {} } }));
    void load();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Intégrations</h1>
          <div className="sub">Jetons propres à votre compte, chiffrés. GitHub, Vercel et Neon sont requis pour déployer.</div>
        </div>
      </div>

      <div className="grid cols-2">
        {CATALOG.map((c) => (
          <div key={c.kind} className="card">
            <div className="row" style={{ paddingTop: 0, borderBottom: 'none' }}>
              <strong>{c.name}{c.required && <span className="muted"> *</span>}</strong>
              {state.get(c.kind)?.hasSecret && <span className="badge succeeded">connecté</span>}
            </div>
            <input
              type="password"
              placeholder={c.secretLabel}
              value={draft[c.kind]?.secret ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, [c.kind]: { secret: e.target.value, config: d[c.kind]?.config ?? {} } }))}
              style={{ marginTop: 8 }}
            />
            {c.fields.map((f) => (
              <input
                key={f.key}
                placeholder={f.label}
                defaultValue={state.get(c.kind)?.config[f.key] ?? ''}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    [c.kind]: { secret: d[c.kind]?.secret ?? '', config: { ...d[c.kind]?.config, [f.key]: e.target.value } },
                  }))
                }
                style={{ marginTop: 8 }}
              />
            ))}
            <button className="btn" style={{ marginTop: 10 }} onClick={() => save(c.kind)}>Enregistrer</button>
          </div>
        ))}
      </div>
    </>
  );
}
