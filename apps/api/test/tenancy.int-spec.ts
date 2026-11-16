import { auth, createTestApp, extractCookie, PASSWORD, registerCompany, Session, TestContext } from './test-app';

describe('Aislamiento multiempresa, roles y planes (integración)', () => {
  let ctx: TestContext;
  let a: Session;
  let b: Session;

  beforeAll(async () => {
    ctx = await createTestApp();
    a = await registerCompany(ctx);
    b = await registerCompany(ctx);
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  const customer = { name: 'Cliente A', documentType: 'CUIT', documentNumber: '20123456786', vatCondition: 'RESPONSABLE_INSCRIPTO' };

  it('una empresa no puede leer, modificar ni eliminar datos de otra', async () => {
    const created = await ctx.http().post('/api/customers').set(auth(a)).send(customer).expect(201);
    const id = created.body.id;

    await ctx.http().get(`/api/customers/${id}`).set(auth(b)).expect(404);
    await ctx.http().patch(`/api/customers/${id}`).set(auth(b)).send({ name: 'hackeado' }).expect(404);
    await ctx.http().delete(`/api/customers/${id}`).set(auth(b)).expect(404);
    const listB = await ctx.http().get('/api/customers').set(auth(b)).expect(200);
    expect(listB.body.data.find((c: { id: string }) => c.id === id)).toBeUndefined();

    const stillThere = await ctx.http().get(`/api/customers/${id}`).set(auth(a)).expect(200);
    expect(stillThere.body.name).toBe('Cliente A');
  });

  it('no permite usar recursos de otra empresa en un comprobante', async () => {
    const posA = await ctx.http().post('/api/points-of-sale').set(auth(a)).send({ number: 10, name: 'PV A' }).expect(201);
    const res = await ctx
      .http()
      .post('/api/invoices')
      .set(auth(b))
      .send({
        pointOfSaleId: posA.body.id,
        kind: 'FACTURA',
        concept: 'PRODUCTS',
        issueDate: new Date().toISOString().slice(0, 10),
        items: [{ description: 'x', quantity: 1, unitPrice: 10 }],
      })
      .expect(400);
    expect(res.body.message).toMatch(/Punto de venta inexistente/);
  });

  it('impide seleccionar una empresa sin membresía', async () => {
    await ctx.http().post('/api/auth/switch-company').set(auth(a)).set('Cookie', a.cookie).send({ companyId: b.companyId }).expect(403);
  });

  it('el token de una empresa no sirve si se manipula el companyId del cuerpo', async () => {
    const res = await ctx.http().post('/api/products').set(auth(b)).send({ companyId: a.companyId, type: 'PRODUCT', name: 'P', price: 1, vatTreatment: 'GRAVADO', vatRate: 21 }).expect(400);
    expect(JSON.stringify(res.body.details)).toMatch(/companyId/);
  });

  it('aplica permisos por rol y revoca el acceso al desactivar al usuario', async () => {
    const roles = await ctx.http().get('/api/roles').set(auth(a)).expect(200);
    const viewer = roles.body.find((r: { systemKey: string }) => r.systemKey === 'viewer');
    const email = `viewer-${Date.now()}@test.local`;
    const invite = await ctx.http().post('/api/users/invite').set(auth(a)).send({ email, firstName: 'V', lastName: 'W', roleId: viewer.id }).expect(201);
    expect(invite.body.status).toBe('INVITED');

    const token = ctx.mail.lastTokenFor(email);
    await ctx.http().post('/api/auth/reset-password').send({ token, password: PASSWORD }).expect(204);
    const login = await ctx.http().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
    const viewerAuth = { Authorization: `Bearer ${login.body.accessToken}` };

    await ctx.http().get('/api/customers').set(viewerAuth).expect(200);
    const denied = await ctx.http().post('/api/customers').set(viewerAuth).send(customer).expect(403);
    expect(denied.body.message).toMatch(/customers.write/);
    await ctx.http().get('/api/audit-logs').set(viewerAuth).expect(403);

    await ctx.http().patch(`/api/users/${invite.body.id}`).set(auth(a)).send({ status: 'DISABLED' }).expect(200);
    // Al desactivarlo se revocan sus sesiones en la empresa: pierde el acceso inmediatamente.
    const after = await ctx.http().get('/api/customers').set(viewerAuth);
    expect([401, 403]).toContain(after.status);
  });

  it('no permite quitar al último propietario ni modificarse a sí mismo', async () => {
    const users = await ctx.http().get('/api/users').set(auth(a)).expect(200);
    const me = users.body.find((u: { user: { email: string } }) => u.user.email === a.email);
    await ctx.http().delete(`/api/users/${me.id}`).set(auth(a)).expect(400);
    await ctx.http().patch(`/api/users/${me.id}`).set(auth(a)).send({ status: 'DISABLED' }).expect(400);
  });

  it('roles personalizados: crea, impide duplicados y no elimina roles de sistema', async () => {
    const created = await ctx.http().post('/api/roles').set(auth(a)).send({ name: 'Ventas', permissions: ['customers.read', 'invoices.read'] }).expect(201);
    await ctx.http().post('/api/roles').set(auth(a)).send({ name: 'ventas', permissions: [] }).expect(409);
    await ctx.http().post('/api/roles').set(auth(a)).send({ name: 'Otro', permissions: ['no.existe'] }).expect(400);
    const roles = await ctx.http().get('/api/roles').set(auth(a)).expect(200);
    const owner = roles.body.find((r: { systemKey: string }) => r.systemKey === 'owner');
    await ctx.http().delete(`/api/roles/${owner.id}`).set(auth(a)).expect(400);
    await ctx.http().delete(`/api/roles/${created.body.id}`).set(auth(a)).expect(204);
  });

  it('aplica límites del plan y modo solo lectura con suscripción vencida', async () => {
    const c = await registerCompany(ctx);
    const basico = await ctx.prisma.plan.findUniqueOrThrow({ where: { code: 'basico' } });
    await ctx.prisma.subscription.update({ where: { companyId: c.companyId }, data: { planId: basico.id } });

    await ctx.http().post('/api/points-of-sale').set(auth(c)).send({ number: 1, name: 'PV 1' }).expect(201);
    const limit = await ctx.http().post('/api/points-of-sale').set(auth(c)).send({ number: 2, name: 'PV 2' }).expect(403);
    expect(limit.body.message).toMatch(/permite hasta 1/);

    await ctx.prisma.subscription.update({ where: { companyId: c.companyId }, data: { status: 'CANCELED' } });
    await ctx.http().get('/api/customers').set(auth(c)).expect(200);
    const ro = await ctx.http().post('/api/customers').set(auth(c)).send(customer).expect(403);
    expect(ro.body.message).toMatch(/solo lectura/);
  });

  it('solo administradores de plataforma acceden al panel SaaS', async () => {
    await ctx.http().get('/api/platform/companies').set(auth(a)).expect(403);
    await ctx.prisma.user.update({ where: { email: b.email }, data: { isPlatformAdmin: true } });
    const list = await ctx.http().get('/api/platform/companies').set(auth(b)).expect(200);
    expect(list.body.meta.total).toBeGreaterThanOrEqual(2);
    await ctx.http().patch(`/api/platform/companies/${a.companyId}/status`).set(auth(b)).send({ status: 'SUSPENDED' }).expect(200);
    // Empresa suspendida: se revocan las sesiones y sus usuarios pierden acceso.
    const suspended = await ctx.http().get('/api/customers').set(auth(a));
    expect([401, 403]).toContain(suspended.status);
    await ctx.http().patch(`/api/platform/companies/${a.companyId}/status`).set(auth(b)).send({ status: 'ACTIVE' }).expect(200);
  });

  it('permite al usuario crear una segunda empresa y cambiar entre ellas', async () => {
    const s = await registerCompany(ctx);
    const { randomCuit } = await import('./test-app');
    const second = await ctx.http().post('/api/companies').set(auth(s)).send({ legalName: 'Segunda SA', cuit: randomCuit(), taxCondition: 'MONOTRIBUTO' }).expect(201);
    const switched = await ctx.http().post('/api/auth/switch-company').set(auth(s)).set('Cookie', s.cookie).send({ companyId: second.body.id }).expect(200);
    expect(switched.body.activeCompanyId).toBe(second.body.id);
    const current = await ctx.http().get('/api/companies/current').set({ Authorization: `Bearer ${switched.body.accessToken}` }).expect(200);
    expect(current.body.legalName).toBe('Segunda SA');
    expect(extractCookie(switched.headers['set-cookie'])).toBeTruthy();
  });
});
