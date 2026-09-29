'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { readJson } from '@/lib/fetch-json';

/** 3 Mo : une fois encodé en base64 (+33 %), le corps reste sous la limite de 4,5 Mo de Vercel. */
const MAX_PDF_BYTES = 3 * 1024 * 1024;

interface Missing {
  id: string;
  label: string;
  href: string;
}

/** Encode un fichier en base64 avec les API du navigateur (pas de `Buffer` côté client). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error ?? new Error('Lecture du fichier impossible.'));
    reader.readAsDataURL(file);
  });
}

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [specText, setSpecText] = useState('');
  const [sourceRepo, setSourceRepo] = useState('');
  const [pdf, setPdf] = useState<File>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [missing, setMissing] = useState<Missing[]>([]);

  function onPdf(file: File | undefined) {
    setError(undefined);
    if (file && file.size > MAX_PDF_BYTES) {
      setPdf(undefined);
      setError(`PDF trop volumineux (${(file.size / 1024 / 1024).toFixed(1)} Mo, 3 Mo maximum). Collez plutôt le texte.`);
      return;
    }
    setPdf(file);
  }

  async function submit() {
    setLoading(true);
    setError(undefined);
    setMissing([]);
    try {
      const specPdfBase64 = pdf ? await fileToBase64(pdf) : undefined;
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, specText, specPdfBase64, sourceRepo: sourceRepo || undefined }),
      });
      const data = await readJson<{ runId?: string; missing?: Missing[] }>(res);
      if (!res.ok || !data.runId) {
        setMissing(data.missing ?? []);
        throw new Error(data.error ?? 'Échec de la création.');
      }
      router.push(`/runs/${data.runId}`);
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  }

  const canSubmit = name.trim().length >= 2 && (specText.trim().length > 0 || Boolean(pdf));

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

        <label>
          Cahier des charges <span className="hint">— PDF (3 Mo max) et/ou texte</span>
        </label>
        <input type="file" accept="application/pdf" onChange={(e) => onPdf(e.target.files?.[0])} />
        {pdf && <div className="muted mono" style={{ marginTop: 6 }}>📄 {pdf.name}</div>}
        <textarea
          rows={8}
          value={specText}
          onChange={(e) => setSpecText(e.target.value)}
          placeholder="Décrivez le besoin, ou complétez le PDF…"
          style={{ marginTop: 8 }}
        />

        <label>
          Dépôt existant <span className="hint">— optionnel : owner/repo ou URL GitHub</span>
        </label>
        <input value={sourceRepo} onChange={(e) => setSourceRepo(e.target.value)} placeholder="mon-org/mon-app" />

        {error && (
          <div className="alert" role="alert">
            <strong>{error}</strong>
            {missing.length > 0 && (
              <ul>
                {missing.map((m) => (
                  <li key={m.id}>
                    {m.label} —{' '}
                    <Link href={m.href} className="link">
                      configurer
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
          <button className="btn" onClick={submit} disabled={loading || !canSubmit}>
            {loading ? 'Lancement…' : 'Lancer la chaîne'}
          </button>
        </div>
      </div>
    </>
  );
}
