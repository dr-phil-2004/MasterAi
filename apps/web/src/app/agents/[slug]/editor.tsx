'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  move,
  providerOf,
  sameAgent,
  slugify,
  toPayload,
  validateAgent,
  type EditorAgent,
} from './validation';

export type { EditorAgent } from './validation';

interface PaletteProvider {
  id: string;
  name: string;
  models: string[];
  configured: boolean;
}

const PHASE_LABELS: Record<string, string> = {
  analyse: 'Analyse',
  architecture: 'Architecture',
  design: 'Design UX/UI',
  setup: 'Mise en place',
  build: 'Développement',
  review: 'Revue de code',
  qa: 'QA',
  security: 'Sécurité',
  deploy: 'Déploiement',
  report: 'Rapport',
};

export function AgentEditor({
  initial,
  isNew,
  builtinDefault,
  palette,
  tools,
  phases,
  takenSlugs,
}: {
  initial: EditorAgent;
  isNew: boolean;
  builtinDefault?: EditorAgent;
  palette: PaletteProvider[];
  tools: { id: string; label: string }[];
  phases: string[];
  takenSlugs: string[];
}) {
  const router = useRouter();
  const [agent, setAgent] = useState<EditorAgent>(initial);
  const [saved, setSaved] = useState<EditorAgent>(initial);
  const [slugTouched, setSlugTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string }>();

  const errors = validateAgent(agent, { isNew, takenSlugs });
  const valid = Object.keys(errors).length === 0;
  const dirty = isNew || !sameAgent(agent, saved);
  const differsFromDefault = builtinDefault ? !sameAgent({ ...agent, enabled: true }, builtinDefault) : false;

  const configuredProviders = useMemo(() => new Set(palette.filter((p) => p.configured).map((p) => p.id)), [palette]);
  const allModels = useMemo(() => palette.flatMap((p) => p.models), [palette]);

  const set = <K extends keyof EditorAgent>(key: K, value: EditorAgent[K]) => {
    setAgent((a) => ({ ...a, [key]: value }));
    setMessage(undefined);
  };
  const toggle = (key: 'tools' | 'phases', value: string) =>
    set(key, agent[key].includes(value) ? agent[key].filter((v) => v !== value) : [...agent[key], value]);
  const showError = (key: keyof EditorAgent) => (submitted || key === 'slug') && errors[key];

  async function save() {
    setSubmitted(true);
    if (!valid) {
      setMessage({ kind: 'error', text: 'Corrigez les champs signalés avant d’enregistrer.' });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/agents', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toPayload(agent)),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`);
      setSaved(agent);
      setMessage({ kind: 'success', text: 'Agent enregistré.' });
      if (isNew) router.replace(`/agents/${agent.slug}`);
      router.refresh();
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Supprimer définitivement l’agent « ${agent.name} » ?`)) return;
    setBusy(true);
    const res = await fetch(`/api/agents?slug=${encodeURIComponent(agent.slug)}`, { method: 'DELETE' });
    setBusy(false);
    if (res.ok) {
      router.push('/agents');
      router.refresh();
    } else setMessage({ kind: 'error', text: 'Suppression impossible.' });
  }

  function reset() {
    if (builtinDefault && confirm('Restaurer la configuration d’origine de ce rôle ?')) {
      setAgent({ ...builtinDefault, enabled: agent.enabled });
      setMessage(undefined);
    }
  }

  return (
    <div className="editor">
      <div className="editor-main">
        {/* Identité */}
        <section className="card">
          <h2>Identité</h2>
          <label>Nom</label>
          <input
            value={agent.name}
            onChange={(e) => {
              set('name', e.target.value);
              if (isNew && !slugTouched) setAgent((a) => ({ ...a, name: e.target.value, slug: slugify(e.target.value) }));
            }}
            placeholder="Relecteur accessibilité"
          />
          {showError('name') && <p className="field-error">{errors.name}</p>}

          {isNew && (
            <>
              <label>
                Identifiant <span className="hint">— utilisé dans l’API, non modifiable ensuite</span>
              </label>
              <input
                className="mono"
                value={agent.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  set('slug', e.target.value.toLowerCase());
                }}
                placeholder="relecteur-accessibilite"
              />
              {agent.slug && showError('slug') && <p className="field-error">{errors.slug}</p>}
            </>
          )}

          <label>Description</label>
          <input
            value={agent.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="Ce que fait l’agent, en une phrase (utilisée par l’orchestrateur pour déléguer)."
          />
          {showError('description') && <p className="field-error">{errors.description}</p>}
        </section>

        {/* Instructions */}
        <section className="card">
          <div className="row" style={{ paddingTop: 0, borderBottom: 'none' }}>
            <h2 style={{ margin: 0 }}>Instructions</h2>
            <span className="muted mono">{agent.instructions.length.toLocaleString('fr-FR')} caractères</span>
          </div>
          <textarea
            className="mono instructions"
            rows={18}
            value={agent.instructions}
            onChange={(e) => set('instructions', e.target.value)}
            placeholder="Tu es… Tes responsabilités… Tes règles…"
            spellCheck={false}
          />
          {showError('instructions') && <p className="field-error">{errors.instructions}</p>}
        </section>

        {/* Modèles */}
        <section className="card">
          <h2>Palette de modèles</h2>
          <p className="muted" style={{ marginTop: -6 }}>
            Le premier modèle est utilisé en priorité ; les suivants prennent le relais en cas d’erreur ou de
            stagnation de la boucle de correction.
          </p>
          <datalist id="model-options">
            {allModels.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <div className="stack" style={{ gap: 8 }}>
            {agent.models.map((model, i) => {
              const provider = providerOf(model.trim());
              const hasKey = configuredProviders.has(provider);
              return (
                <div key={i} className="model-row">
                  <span className="model-rank">{i === 0 ? 'Principal' : `Repli ${i}`}</span>
                  <input
                    className="mono"
                    list="model-options"
                    value={model}
                    onChange={(e) => set('models', agent.models.map((m, j) => (j === i ? e.target.value : m)))}
                    placeholder="fournisseur/modèle"
                  />
                  {model.trim() && (
                    <span className={`badge ${hasKey ? 'succeeded' : 'staging'}`} title={hasKey ? 'Clé configurée' : 'Aucune clé pour ce fournisseur'}>
                      {hasKey ? 'clé ✓' : 'sans clé'}
                    </span>
                  )}
                  <button type="button" className="icon-btn" aria-label="Monter" disabled={i === 0} onClick={() => set('models', move(agent.models, i, -1))}>
                    ↑
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Descendre"
                    disabled={i === agent.models.length - 1}
                    onClick={() => set('models', move(agent.models, i, 1))}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Retirer"
                    disabled={agent.models.length === 1}
                    onClick={() => set('models', agent.models.filter((_, j) => j !== i))}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
          {showError('models') && <p className="field-error">{errors.models}</p>}
          <button type="button" className="btn ghost" style={{ marginTop: 12 }} onClick={() => set('models', [...agent.models, ''])}>
            + Ajouter un modèle de repli
          </button>
          {agent.models.some((m) => m.trim() && !configuredProviders.has(providerOf(m.trim()))) && (
            <p className="muted" style={{ marginTop: 10 }}>
              Les modèles « sans clé » sont ignorés à l’exécution. Ajoutez la clé dans{' '}
              <Link href="/settings/models" className="link">
                Paramètres → Modèles
              </Link>
              .
            </p>
          )}
        </section>
      </div>

      <aside className="editor-side">
        {/* Actions */}
        <section className="card">
          <label className="switch">
            <input type="checkbox" checked={agent.enabled} onChange={(e) => set('enabled', e.target.checked)} />
            <span>{agent.enabled ? 'Agent activé' : 'Agent désactivé'}</span>
          </label>
          <button className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 14 }} disabled={busy || !dirty} onClick={save}>
            {busy ? 'Enregistrement…' : isNew ? 'Créer l’agent' : dirty ? 'Enregistrer' : 'Enregistré'}
          </button>
          {message && <p className={message.kind === 'success' ? 'field-success' : 'field-error'}>{message.text}</p>}
          {builtinDefault && differsFromDefault && (
            <button className="btn ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} onClick={reset} disabled={busy}>
              Réinitialiser le rôle
            </button>
          )}
          {!isNew && !agent.isBuiltin && (
            <button className="btn danger" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} onClick={remove} disabled={busy}>
              Supprimer
            </button>
          )}
        </section>

        {/* Outils */}
        <section className="card">
          <h2>Outils</h2>
          <div className="stack" style={{ gap: 6 }}>
            {tools.map((t) => (
              <label key={t.id} className="check">
                <input type="checkbox" checked={agent.tools.includes(t.id)} onChange={() => toggle('tools', t.id)} />
                <span>
                  {t.label} <span className="muted mono">{t.id}</span>
                </span>
              </label>
            ))}
          </div>
        </section>

        {/* Phases */}
        <section className="card">
          <h2>Phases</h2>
          {agent.isBuiltin ? (
            <p className="muted">
              Un rôle prédéfini intervient selon sa place dans la chaîne :{' '}
              {agent.phases.map((p) => PHASE_LABELS[p] ?? p).join(', ') || '—'}.
            </p>
          ) : (
            <>
              <p className="muted" style={{ marginTop: -6 }}>
                Étapes où cet agent intervient en complément du rôle prédéfini.
              </p>
              <div className="stack" style={{ gap: 6 }}>
                {phases.map((p) => (
                  <label key={p} className="check">
                    <input type="checkbox" checked={agent.phases.includes(p)} onChange={() => toggle('phases', p)} />
                    <span>{PHASE_LABELS[p] ?? p}</span>
                  </label>
                ))}
              </div>
              {showError('phases') && <p className="field-error">{errors.phases}</p>}
            </>
          )}
        </section>

        {/* Température */}
        <section className="card">
          <h2>Température</h2>
          <label className="check">
            <input
              type="checkbox"
              checked={agent.temperature !== null}
              onChange={(e) => set('temperature', e.target.checked ? 30 : null)}
            />
            <span>Personnaliser</span>
          </label>
          {agent.temperature !== null ? (
            <div style={{ marginTop: 10 }}>
              <input
                type="range"
                min={0}
                max={100}
                value={agent.temperature}
                onChange={(e) => set('temperature', Number(e.target.value))}
                style={{ padding: 0 }}
              />
              <div className="row" style={{ borderBottom: 'none', padding: '4px 0 0' }}>
                <span className="muted">Précis</span>
                <span className="mono">{(agent.temperature / 100).toFixed(2)}</span>
                <span className="muted">Créatif</span>
              </div>
            </div>
          ) : (
            <p className="muted">Valeur par défaut du modèle.</p>
          )}
        </section>
      </aside>
    </div>
  );
}
