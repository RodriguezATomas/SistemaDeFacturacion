/**
 * Seed de datos base (idempotente):
 * - Catálogo de permisos.
 * - Planes SaaS iniciales.
 * - Administrador de plataforma (solo si se definen SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD).
 * No crea datos de negocio ficticios.
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { PERMISSIONS } from '../src/common/permissions';

const prisma = new PrismaClient();

const PLANS = [
  {
    code: 'basico',
    name: 'Básico',
    description: 'Para profesionales y emprendimientos',
    priceMonthly: 0,
    maxUsers: 2,
    maxPointsOfSale: 1,
    maxInvoicesPerMonth: 100,
  },
  {
    code: 'profesional',
    name: 'Profesional',
    description: 'Para pymes con equipo de trabajo',
    priceMonthly: 0,
    maxUsers: 10,
    maxPointsOfSale: 5,
    maxInvoicesPerMonth: 2000,
  },
  {
    code: 'empresa',
    name: 'Empresa',
    description: 'Sin límites operativos',
    priceMonthly: 0,
    maxUsers: null,
    maxPointsOfSale: null,
    maxInvoicesPerMonth: null,
  },
];

async function main() {
  for (const p of Object.values(PERMISSIONS)) {
    await prisma.permission.upsert({ where: { code: p.code }, update: p, create: p });
  }
  for (const plan of PLANS) {
    // Los precios se administran desde el panel de plataforma; el seed no los sobrescribe.
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
