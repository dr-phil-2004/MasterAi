/** Écran affiché quand la plateforme n'est pas encore configurée (preview sans base, ou base non initialisée). */
export function SetupNotice({ reason, message }: { reason: 'no-db' | 'not-seeded'; message: string }) {
  return (
    <div className="card" style={{ maxWidth: 720 }}>
      <h2>Configuration requise</h2>
      {reason === 'no-db' ? (
        <>
          <p className="muted">
            La base de données de la plateforme n’est pas connectée. Cette preview s’affiche, mais les données
            (projets, agents, réglages) nécessitent une base PostgreSQL.
          </p>
          <ol className="muted" style={{ lineHeight: 1.9 }}>
            <li>Définir <span className="mono">DATABASE_URL</span> (PostgreSQL, ex. Neon) dans les variables d’environnement.</li>
            <li>Définir <span className="mono">MASTERAI_ENCRYPTION_KEY</span> (32 octets base64 : <span className="mono">openssl rand -base64 32</span>).</li>
            <li>Appliquer les migrations et l’amorçage : <span className="mono">pnpm db:migrate &amp;&amp; pnpm db:seed</span>.</li>
          </ol>
        </>
      ) : (
        <>
          <p className="muted">
            La base est connectée mais pas encore initialisée. Lancez les migrations et l’amorçage :
          </p>
          <pre className="mono" style={{ background: 'var(--panel-2)', padding: 12, borderRadius: 8 }}>
            pnpm db:migrate &amp;&amp; pnpm db:seed
          </pre>
          <p className="muted mono" style={{ marginTop: 8 }}>Détail : {message}</p>
        </>
      )}
    </div>
  );
}
