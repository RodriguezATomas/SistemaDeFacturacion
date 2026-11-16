import { randomBytes } from 'crypto';
import { PasswordService } from '../src/modules/auth/password.service';
import { CompanyProvisioningService } from '../src/modules/companies/company-provisioning.service';
import { createTestApp, PASSWORD, randomCuit, TestContext } from './test-app';

/** Misma base de código en modalidad de instalación privada (DEPLOYMENT_MODE=private). */
describe('Modalidad instalación privada (integración)', () => {
  let ctx: TestContext;
  const previous = process.env.DEPLOYMENT_MODE;

  beforeAll(async () => {
    process.env.DEPLOYMENT_MODE = 'private';
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
    process.env.DEPLOYMENT_MODE = previous;
  });

  it('informa la modalidad y deshabilita el registro público', async () => {
    const cfg = await ctx.http().get('/api/auth/config').expect(200);
    expect(cfg.body).toEqual({ deploymentMode: 'private', registrationEnabled: false });
    await ctx
      .http()
      .post('/api/auth/register')
      .send({ firstName: 'A', lastName: 'B', email: 'priv@test.local', password: PASSWORD, company: { legalName: 'Privada SA', cuit: randomCuit(), taxCondition: 'EXENTO' } })
      .expect(403);
  });

  it('la empresa inicial tiene licencia sin límites y opera sin panel SaaS', async () => {
    const email = `owner-${randomBytes(4).toString('hex')}@test.local`;
    const passwordHash = await ctx.app.get(PasswordService).hash(PASSWORD);
    const provisioning = ctx.app.get(CompanyProvisioningService);
    const company = await ctx.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email, passwordHash, firstName: 'Dueño', lastName: 'Privado', isPlatformAdmin: true } });
      return provisioning.provision(tx, { legalName: 'Instalación Privada SA', cuit: randomCuit(), taxCondition: 'RESPONSABLE_INSCRIPTO' }, user.id);
    });
    const sub = await ctx.prisma.subscription.findUnique({ where: { companyId: company.id }, include: { plan: true } });
    expect(sub?.status).toBe('ACTIVE');
    expect(sub?.plan.code).toBe('instalacion-privada');
    expect(sub?.plan.maxPointsOfSale).toBeNull();

    const login = await ctx.http().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
    const auth = { Authorization: `Bearer ${login.body.accessToken}` };
    for (let n = 1; n <= 7; n++) {
      await ctx.http().post('/api/points-of-sale').set(auth).send({ number: n, name: `PV ${n}` }).expect(201);
    }
    await ctx.http().post('/api/companies').set(auth).send({ legalName: 'Otra SA', cuit: randomCuit(), taxCondition: 'EXENTO' }).expect(403);
    await ctx.http().get('/api/platform/companies').set(auth).expect(403);
  });
});
