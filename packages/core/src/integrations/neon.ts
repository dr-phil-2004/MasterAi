import { requireIntegration, type RunRuntime } from '../lib/runtime';

const API = 'https://console.neon.tech/api/v2';

async function api<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API Neon ${method} ${path} : ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

interface ConnectionUris {
  connection_uris?: { connection_uri: string }[];
}

/**
 * Provisionne une base PostgreSQL Neon : la branche principale sert la production,
 * une branche `staging` isole les données de test et du pentest.
 */
export async function provisionDatabase(runtime: RunRuntime) {
  const neon = requireIntegration(runtime, 'neon');
  const created = await api<ConnectionUris & { project: { id: string } }>(neon.secret, 'POST', '/projects', {
    project: { name: runtime.projectSlug, region_id: neon.config.regionId || 'aws-eu-central-1' },
  });
  const productionUrl = created.connection_uris?.[0]?.connection_uri;
  const staging = await api<ConnectionUris>(neon.secret, 'POST', `/projects/${created.project.id}/branches`, {
    branch: { name: 'staging' },
    endpoints: [{ type: 'read_write' }],
  });
  const stagingUrl = staging.connection_uris?.[0]?.connection_uri;
  if (!productionUrl || !stagingUrl) throw new Error('Neon n’a pas renvoyé de chaîne de connexion.');
  return { neonProjectId: created.project.id, productionUrl, stagingUrl };
}
