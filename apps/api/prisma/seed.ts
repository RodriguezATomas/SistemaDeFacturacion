/**
 * Seed de datos base (idempotente) para desarrollo:
 * - Catálogo de permisos y planes SaaS iniciales (la API también los asegura al iniciar).
 * - Administrador de plataforma (solo si se definen SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD).
 * No crea datos de negocio ficticios.
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { PERMISSIONS } from '../src/common/permissions';
import { DEFAULT_PLANS } from '../src/modules/companies/permissions-sync.service';

const prisma = new PrismaClient();

async function main() {
  for (const p of Object.values(PERMISSIONS)) {
    await prisma.permission.upsert({ where: { code: p.code }, update: p, create: p });
  }
  for (const plan of DEFAULT_PLANS) {
    await prisma.plan.upsert({ where: { code: plan.code }, update: {}, create: plan });
  }

  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (email && password) {
    if (password.length < 10) throw new Error('SEED_ADMIN_PASSWORD debe tener al menos 10 caracteres');
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.user.upsert({
      where: { email },
      update: { isPlatformAdmin: true },
      create: { email, passwordHash, firstName: 'Administrador', lastName: 'Plataforma', isPlatformAdmin: true },
    });
    console.warn(`Administrador de plataforma asegurado: ${email}`);
  }
  console.warn('Seed completado.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
