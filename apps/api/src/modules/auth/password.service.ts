import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/** Hash de contraseñas con Argon2id (parámetros recomendados por OWASP). */
@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  }

  private dummyHash?: Promise<string>;

  /** Verificación contra un hash descartable: iguala el tiempo de respuesta cuando el usuario no existe. */
  async verifyDummy(plain: string): Promise<void> {
    this.dummyHash ??= this.hash('dummy-password-for-timing');
    await this.verify(await this.dummyHash, plain);
  }

  async verify(hash: string | null | undefined, plain: string): Promise<boolean> {
    if (!hash) return false;
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }
}
