'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [specText, setSpecText] = useState('');
  const [sourceRepo, setSourceRepo] = useState('');
  const [pdfName, setPdfName] = useState<string>();
  const [pdfBase64, setPdfBase64] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  async function onPdf(file: File) {
    const buffer = await file.arrayBuffer();
    setPdfBase64(Buffer.from(buffer).toString('base64'));
    setPdfName(file.name);
  }

  async function submit() {
    setLoading(true);
    setError(undefined);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, specText, specPdfBase64: pdfBase64, sourceRepo: sourceRepo || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Échec de la création.');
      router.push(`/runs/${data.runId}`);
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Nouveau projet</h1>
          <div className="sub">Fournissez le cahier des charges : la chaîne d’agents fait le reste.</div>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 720 }}>
        <label>Nom du projet</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Plateforme de réservation" />

        <label>Cahier des charges <span className="hint">— PDF ou texte</span></label>
        <input type="file" accept="application/pdf" onChange={(e) => e.target.files?.[0] && onPdf(e.target.files[0])} />
        {pdfName && <div className="muted mono" style={{ marginTop: 6 }}>📄 {pdfName}</div>}
        <textarea
          rows={8}
          value={specText}
          onChange={(e) => setSpecText(e.target.value)}
          placeholder="Décrivez le besoin, ou complétez le PDF…"
          style={{ marginTop: 8 }}
        />

        <label>Dépôt existant <span className="hint">— optionnel, format owner/repo</span></label>
        <input value={sourceRepo} onChange={(e) => setSourceRepo(e.target.value)} placeholder="mon-org/mon-app" />

        {error && <div className="badge failed" style={{ marginTop: 16 }}>{error}</div>}

        <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
          <button className="btn" onClick={submit} disabled={loading || !name}>
            {loading ? 'Lancement…' : 'Lancer la chaîne'}
          </button>
        </div>
      </div>
    </>
  );
}
