/**
 * Lit le corps JSON d'une réponse sans jamais lever d'exception :
 * un corps vide ou non-JSON (erreur de plateforme, 500 muet, 413…) devient `{ error }` lisible.
 */
export async function readJson<T extends Record<string, unknown>>(res: Response): Promise<T & { error?: string }> {
  const text = await res.text().catch(() => '');
  if (text) {
    try {
      return JSON.parse(text) as T & { error?: string };
    } catch {
      // Corps non JSON : on le résume ci-dessous.
    }
  }
  if (res.ok) return {} as T & { error?: string };
  const hint =
    res.status === 413
      ? 'fichier trop volumineux'
      : res.status === 504
        ? 'délai dépassé côté serveur'
        : text.trim().slice(0, 200) || 'réponse vide du serveur';
  return { error: `Erreur ${res.status} : ${hint}` } as T & { error?: string };
}
