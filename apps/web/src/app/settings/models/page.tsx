'use client';

import { useEffect, useState } from 'react';

interface Palette {
  palette: { id: string; name: string; models: string[]; configured: boolean; docUrl?: string }[];
  configured: { provider: string; masked: string | null; baseUrl?: string }[];
}

export default function ModelsPage() {
  const [data, setData] = useState<Palette>();
  const [showAll, setShowAll] = useState(false);
  const [draft, setDraft] = useState<Record<string, { apiKey: string; baseUrl: string }>>({});

  async function load(all = showAll) {
    const res = await fetch(`/api/models?all=${all ? 1 : 0}`);
    setData(await res.json());
  }
  useEffect(() => {
    void load();
  }, []);

  async function save(provider: string) {
    const body = draft[provider];
    await fetch('/api/models', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, apiKey: body?.apiKey || undefined, baseUrl: body?.baseUrl || undefined }),
    });
    setDraft((d) => ({ ...d, [provider]: { apiKey: '', baseUrl: '' } }));
    void load();
  }

  const masked = new Map(data?.configured.map((c) => [c.provider, c]) ?? []);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Modèles</h1>
          <div className="sub">Vos clés API (BYOK), chiffrées. Elles alimentent la palette de chaque agent.</div>
        </div>
        <button className="btn ghost" onClick={() => { setShowAll((v) => !v); void load(!showAll); }}>
          {showAll ? 'Fournisseurs mis en avant' : `Tous les fournisseurs`}
        </button>
      </div>

      <div className="grid cols-2">
        {data?.palette.map((p) => (
          <div key={p.id} className="card">
            <div className="row" style={{ paddingTop: 0, borderBottom: 'none' }}>
              <strong>{p.name}</strong>
              {p.configured && <span className="badge succeeded">clé configurée</span>}
            </div>
            {masked.get(p.id)?.masked && <div className="muted mono">Clé : {masked.get(p.id)!.masked}</div>}
            <input
              type="password"
              placeholder={p.configured ? 'Remplacer la clé…' : 'Clé API'}
              value={draft[p.id]?.apiKey ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, [p.id]: { ...d[p.id], apiKey: e.target.value, baseUrl: d[p.id]?.baseUrl ?? '' } }))}
              style={{ marginTop: 10 }}
            />
            {p.id.startsWith('custom:') && (
              <input
                placeholder="URL de base (compatible OpenAI)"
                value={draft[p.id]?.baseUrl ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, [p.id]: { ...d[p.id], baseUrl: e.target.value, apiKey: d[p.id]?.apiKey ?? '' } }))}
                style={{ marginTop: 8 }}
              />
            )}
            <button className="btn" style={{ marginTop: 10 }} onClick={() => save(p.id)}>Enregistrer</button>
            {p.models.length > 0 && (
              <div className="muted mono" style={{ marginTop: 10 }}>{p.models.length} modèles disponibles</div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
