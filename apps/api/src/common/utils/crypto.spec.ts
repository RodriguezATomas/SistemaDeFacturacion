import { randomBytes } from 'crypto';
import { decryptSecret, encryptSecret, randomToken, sha256 } from './crypto';

describe('crypto utils', () => {
  const key = randomBytes(32).toString('base64');

  it('cifra y descifra preservando el contenido', () => {
    const secret = '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----';
    const enc = encryptSecret(secret, key);
    expect(enc).not.toContain('PRIVATE KEY');
    expect(decryptSecret(enc, key)).toBe(secret);
  });

  it('usa IV aleatorio (mismo texto produce cifrados distintos)', () => {
    expect(encryptSecret('x', key)).not.toBe(encryptSecret('x', key));
  });

  it('detecta manipulación del cifrado', () => {
    const enc = encryptSecret('dato', key).split('.');
    enc[3] = Buffer.from('otro').toString('base64');
    expect(() => decryptSecret(enc.join('.'), key)).toThrow();
  });

  it('falla con otra clave', () => {
    const enc = encryptSecret('dato', key);
    expect(() => decryptSecret(enc, randomBytes(32).toString('base64'))).toThrow();
  });

  it('genera tokens únicos y hashes deterministas', () => {
    expect(randomToken()).not.toBe(randomToken());
    expect(sha256('a')).toBe(sha256('a'));
    expect(sha256('a')).toHaveLength(64);
  });
});
