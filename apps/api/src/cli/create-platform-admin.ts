/**
 * Crea (o promueve) un administrador de la plataforma SaaS. Se compila junto con la API para
 * poder ejecutarlo dentro del contenedor de producción:
 *   docker compose exec -e ADMIN_PASSWORD='<clave>' api node dist/cli/create-platform-admin.js admin@empresa.com
 */
import '../config/load-env';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Uso: create-platform-admin <email>');
  if (!password || !/^(?=.*[A-Za-z])(?=.*\d).{10,128}$/.test(password)) {
    throw new Error('Defina ADMIN_PASSWORD (10+ caracteres con letras y números)');
  }
  const prisma = new PrismaClient();
  try {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.user.upsert({
      where: { email },
      update: { isPlatformAdmin: true },
      create: { email, passwordHash, firstName: 'Administrador', lastName: 'Plataforma', isPlatformAdmin: true },
    });
    console.warn(`Administrador de plataforma listo: ${email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
