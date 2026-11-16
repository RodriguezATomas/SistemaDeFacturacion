import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/** Hash SHA-256 de tokens opacos (refresh, recuperación): en la base nunca se guarda el token en claro. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 48): string {
  return randomBytes(bytes).toString('base64url');
}

const ALGO = 'aes-256-gcm';

/**
 * Cifrado autenticado AES-256-GCM para certificados, claves privadas y tickets de ARCA.
 * Formato: v1.<iv>.<authTag>.<ciphertext> (base64).
 */
export function encryptSecret(plain: string, keyBase64: string): string {
  const key = Buffer.from(keyBase64, 'base64');
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.');
}

export function decryptSecret(payload: string, keyBase64: string): string {
  const [version, iv, tag, data] = payload.split('.');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Formato de secreto cifrado inválido');
  const decipher = createDecipheriv(
    ALGO,
    Buffer.from(keyBase64, 'base64'),
    Buffer.from(iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString(
    'utf8',
  );
}
