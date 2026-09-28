/**
 * Garde-fou du pentest : seule l'URL de staging du projet (déployée par la chaîne elle-même)
 * peut être scannée. Toute autre cible est refusée, même si un agent la demande.
 */
export class ForbiddenTargetError extends Error {}

export function assertAllowedPentestTarget(target: string, stagingUrl: string | undefined): URL {
  if (!stagingUrl) {
    throw new ForbiddenTargetError("Pentest refusé : aucun environnement de staging n'a été déployé pour ce projet.");
  }
  let url: URL;
  let allowed: URL;
  try {
    url = new URL(target);
    allowed = new URL(stagingUrl);
  } catch {
    throw new ForbiddenTargetError(`Pentest refusé : URL invalide « ${target} ».`);
  }
  if (url.protocol !== 'https:') {
    throw new ForbiddenTargetError('Pentest refusé : seules les URL HTTPS de staging sont autorisées.');
  }
  if (url.hostname !== allowed.hostname) {
    throw new ForbiddenTargetError(
      `Pentest refusé : « ${url.hostname} » n'est pas l'environnement de staging du projet (${allowed.hostname}).`,
    );
  }
  return url;
}
