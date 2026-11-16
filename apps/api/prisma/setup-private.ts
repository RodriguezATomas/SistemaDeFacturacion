/**
 * Alta inicial de una INSTALACIÓN PRIVADA: crea la empresa y su usuario propietario.
 * Uso (con DEPLOYMENT_MODE=private):
 *   npm run setup:private -w apps/api -- --company "Mi Empresa S.A." --cuit 30500010912 \
 *     --tax RESPONSABLE_INSCRIPTO --email admin@empresa.com --first Ana --last Pérez
 * La contraseña se lee de la variable SETUP_ADMIN_PASSWORD (no se pasa por línea de comandos).
 */
import '../src/config/load-env';
import { NestFactory } from '@nestjs/core';
import { TaxCondition } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { isValidCuit, normalizeCuit } from '../src/common/utils/cuit';
import { PasswordService } from '../src/modules/auth/password.service';
import { CompanyProvisioningService } from '../src/modules/companies/company-provisioning.service';
import { PermissionsSyncService } from '../src/modules/companies/permissions-sync.service';
import { PrismaService } from '../src/prisma/prisma.service';

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const value = i >= 0 ? process.argv[i + 1] : undefined;
  if (!value) throw new Error(`Falta el argumento --${name}`);
  return value;
}

async function main() {
  if (process.env.DEPLOYMENT_MODE !== 'private') {
    throw new Error('Este script es solo para instalaciones privadas (DEPLOYMENT_MODE=private)');
  }
  const password = process.env.SETUP_ADMIN_PASSWORD;
  if (!password || !/^(?=.*[A-Za-z])(?=.*\d).{10,128}$/.test(password)) {
    throw new Error('Defina SETUP_ADMIN_PASSWORD (10+ caracteres con letras y números)');
  }
  const cuit = normalizeCuit(arg('cuit'));
  if (!isValidCuit(cuit)) throw new Error('CUIT inválida');
  const taxCondition = arg('tax') as TaxCondition;
  if (!Object.values(TaxCondition).includes(taxCondition)) throw new Error('Condición fiscal inválida');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const prisma = app.get(PrismaService);
    await app.get(PermissionsSyncService).sync();
    if ((await prisma.company.count()) > 0) {
      throw new Error('La instalación ya tiene una empresa configurada');
    }
    const email = arg('email').trim().toLowerCase();
    const passwordHash = await app.get(PasswordService).hash(password);
    const provisioning = app.get(CompanyProvisioningService);
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, passwordHash, firstName: arg('first'), lastName: arg('last') },
      });
      await provisioning.provision(tx, { legalName: arg('company'), cuit, taxCondition }, user.id);
    });
    console.warn(`Instalación privada configurada. Ingrese con ${email}.`);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
