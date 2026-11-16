import { auth, createTestApp, extractCookie, PASSWORD, registerCompany, TestContext } from './test-app';

describe('Autenticación y sesiones (integración)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('registra usuario + empresa con roles de sistema, suscripción de prueba y auditoría', async () => {
    const s = await registerCompany(ctx);
    const me = await ctx.http().get('/api/auth/me').set(auth(s)).expect(200);
    expect(me.body.activeCompanyId).toBe(s.companyId);
    expect(me.body.companies[0].role).toBe('Propietario');
    expect(me.body.permissions).toContain('invoices.emit');

    const roles = await ctx.prisma.role.findMany({ where: { companyId: s.companyId } });
    expect(roles.map((r) => r.systemKey).sort()).toEqual(['admin', 'billing', 'owner', 'viewer']);
    const sub = await ctx.prisma.subscription.findUnique({ where: { companyId: s.companyId } });
    expect(sub?.status).toBe('TRIAL');
    const audit = await ctx.prisma.auditLog.findFirst({ where: { companyId: s.companyId, action: 'auth.register' } });
    expect(audit).toBeTruthy();
    const user = await ctx.prisma.user.findUnique({ where: { email: s.email } });
    expect(user?.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('rechaza email duplicado, CUIT inválida y contraseña débil', async () => {
    const s = await registerCompany(ctx);
    const base = { firstName: 'A', lastName: 'B', password: PASSWORD, company: { legalName: 'Empresa Duplicada', cuit: '30500010912', taxCondition: 'MONOTRIBUTO' } };
    await ctx.http().post('/api/auth/register').send({ ...base, email: s.email }).expect(409);
    await ctx.http().post('/api/auth/register').send({ ...base, email: 'n1@test.local', company: { ...base.company, cuit: '30500010913' } }).expect(400);
    await ctx.http().post('/api/auth/register').send({ ...base, email: 'n2@test.local', password: 'corta' }).expect(400);
  });

  it('login, refresh con rotación y detección de reutilización', async () => {
    const s = await registerCompany(ctx);
    const login = await ctx.http().post('/api/auth/login').send({ email: s.email, password: PASSWORD }).expect(200);
    const cookie1 = extractCookie(login.headers['set-cookie']);

    const r1 = await ctx.http().post('/api/auth/refresh').set('Cookie', cookie1).expect(200);
    const cookie2 = extractCookie(r1.headers['set-cookie']);
    expect(cookie2).not.toBe(cookie1);
    await ctx.http().get('/api/auth/me').set({ Authorization: `Bearer ${r1.body.accessToken}` }).expect(200);

    // Reutilizar el token ya rotado revoca toda la sesión.
    await ctx.http().post('/api/auth/refresh').set('Cookie', cookie1).expect(401);
    await ctx.http().post('/api/auth/refresh').set('Cookie', cookie2).expect(401);
    await ctx.http().get('/api/auth/me').set({ Authorization: `Bearer ${r1.body.accessToken}` }).expect(401);
  });

  it('logout invalida el access token de inmediato', async () => {
    const s = await registerCompany(ctx);
    await ctx.http().post('/api/auth/logout').set(auth(s)).expect(204);
    await ctx.http().get('/api/auth/me').set(auth(s)).expect(401);
  });

  it('bloquea la cuenta tras 5 intentos fallidos', async () => {
    const s = await registerCompany(ctx);
    for (let i = 0; i < 5; i++) {
      await ctx.http().post('/api/auth/login').send({ email: s.email, password: 'incorrecta1234' }).expect(401);
    }
    const locked = await ctx.http().post('/api/auth/login').send({ email: s.email, password: PASSWORD }).expect(401);
    expect(locked.body.message).toMatch(/bloqueada/);
  });

  it('no revela si un email existe al iniciar sesión o recuperar contraseña', async () => {
    const a = await ctx.http().post('/api/auth/login').send({ email: 'noexiste@test.local', password: PASSWORD }).expect(401);
    expect(a.body.message).toBe('Email o contraseña incorrectos');
    await ctx.http().post('/api/auth/forgot-password').send({ email: 'noexiste@test.local' }).expect(202);
  });

  it('recupera la contraseña con token de un solo uso y cierra sesiones', async () => {
    const s = await registerCompany(ctx);
    await ctx.http().post('/api/auth/forgot-password').send({ email: s.email }).expect(202);
    const token = ctx.mail.lastTokenFor(s.email);
    await ctx.http().post('/api/auth/reset-password').send({ token, password: 'NuevaClave456' }).expect(204);
    await ctx.http().post('/api/auth/reset-password').send({ token, password: 'OtraClave789' }).expect(400);
    await ctx.http().get('/api/auth/me').set(auth(s)).expect(401);
    await ctx.http().post('/api/auth/login').send({ email: s.email, password: 'NuevaClave456' }).expect(200);
  });

  it('cambia la contraseña verificando la actual', async () => {
    const s = await registerCompany(ctx);
    await ctx.http().post('/api/auth/change-password').set(auth(s)).send({ currentPassword: 'mal', newPassword: 'NuevaClave456' }).expect(400);
    await ctx.http().post('/api/auth/change-password').set(auth(s)).send({ currentPassword: PASSWORD, newPassword: 'NuevaClave456' }).expect(204);
    await ctx.http().post('/api/auth/login').send({ email: s.email, password: 'NuevaClave456' }).expect(200);
  });

  it('requiere token en endpoints protegidos y no expone stack traces', async () => {
    const res = await ctx.http().get('/api/customers').expect(401);
    expect(res.body).toMatchObject({ statusCode: 401, path: '/api/customers' });
    expect(res.body.requestId).toBeDefined();
    expect(JSON.stringify(res.body)).not.toMatch(/at \w+ \(/);
  });

  it('valida y descarta campos no permitidos (whitelist)', async () => {
    const s = await registerCompany(ctx);
    const res = await ctx
      .http()
      .post('/api/customers')
      .set(auth(s))
      .send({ name: 'X', documentType: 'DNI', documentNumber: '12345678', vatCondition: 'CONSUMIDOR_FINAL', companyId: 'otra' })
      .expect(400);
    expect(JSON.stringify(res.body.details)).toMatch(/companyId/);
  });
});
