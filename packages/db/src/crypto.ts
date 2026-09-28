import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;

/** Lit la clé maître (32 octets en base64) depuis `MASTERAI_ENCRYPTION_KEY`. */
export function getEncryptionKey(raw = process.env.MASTERAI_ENCRYPTION_KEY): Buffer {
  if (!raw) throw new Error('MASTERAI_ENCRYPTION_KEY est manquante (32 octets en base64).');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('MASTERAI_ENCRYPTION_KEY doit faire 32 octets une fois décodée.');
  return key;
}

/** Chiffre un secret : `v1.<iv>.<tag>.<données>` en base64url. */
export function encryptSecret(plain: string, key = getEncryptionKey()): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv, tag, data].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join('.');
}

export function decryptSecret(payload: string, key = getEncryptionKey()): string {
  const [version, iv, tag, data] = payload.split('.');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Format de secret chiffré invalide.');
  const decipher = createDecipheriv(ALGO, key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}

/** Affiche un secret de façon sûre dans l'UI (`sk-a…9f2c`). */
export function maskSecret(secret: string): string {
  if (secret.length <= 8) return '••••';
  return `${secret.slice(0, 4)}…${secret.slice(-4)}`;
}
