import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { WsfeService } from '../src/modules/arca/wsfe/wsfe.service';
import { MailMessage, MailService } from '../src/modules/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { setupApp } from '../src/setup-app';
import { FakeWsfe } from './fake-wsfe';

export class CapturingMail {
  sent: MailMessage[] = [];
  async send(m: MailMessage) {
    this.sent.push(m);
  }
  link(path: string) {
    return `http://localhost:5173${path}`;
  }
  lastTokenFor(email: string): string {
    const msg = [...this.sent].reverse().find((m) => m.to === email);
    const match = msg && /token=([^&\s]+)/.exec(msg.text);
    if (!match) throw new Error(`Sin email con token para ${email}`);
    return decodeURIComponent(match[1]);
  }
}

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  wsfe: FakeWsfe;
  mail: CapturingMail;
  http: () => ReturnType<typeof request>;
}

export async function createTestApp(): Promise<TestContext> {
  const wsfe = new FakeWsfe();
  const mail = new CapturingMail();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(WsfeService)
    .useValue(wsfe)
    .overrideProvider(MailService)
    .useValue(mail)
    .compile();
  const app = moduleRef.createNestApplication();
  setupApp(app);
  await app.init();
  const prisma = app.get(PrismaService);
  await ensurePlans(prisma);
  return { app, prisma, wsfe, mail, http: () => request(app.getHttpServer()) };
}

async function ensurePlans(prisma: PrismaService) {
  const plans = [
    { code: 'basico', name: 'Básico', maxUsers: 2, maxPointsOfSale: 1, maxInvoicesPerMonth: 100 },
    { code: 'profesional', name: 'Profesional', maxUsers: 10, maxPointsOfSale: 5, maxInvoicesPerMonth: 2000 },
  ];
  for (const p of plans) await prisma.plan.upsert({ where: { code: p.code }, update: {}, create: p });
}

/** CUIT válida aleatoria (prefijo 30) para aislar cada empresa de prueba. */
export function randomCuit(): string {
  const base = `30${String(randomBytes(4).readUInt32BE() % 100000000).padStart(8, '0')}`;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(base[i]), 0);
  const mod = 11 - (sum % 11);
  if (mod === 10) return randomCuit();
  return `${base}${mod === 11 ? 0 : mod}`;
}

export interface Session {
  token: string;
  cookie: string;
  companyId: string;
  email: string;
}

export const PASSWORD = 'ClaveSegura123';

export async function registerCompany(
  ctx: TestContext,
  opts: { taxCondition?: 'RESPONSABLE_INSCRIPTO' | 'MONOTRIBUTO' | 'EXENTO'; email?: string } = {},
): Promise<Session> {
  const email = opts.email ?? `user-${randomBytes(4).toString('hex')}@test.local`;
  const res = await ctx
    .http()
    .post('/api/auth/register')
    .send({
      firstName: 'Test',
      lastName: 'User',
      email,
      password: PASSWORD,
      company: { legalName: `Empresa ${email}`, cuit: randomCuit(), taxCondition: opts.taxCondition ?? 'RESPONSABLE_INSCRIPTO' },
    })
    .expect(201);
  return {
    token: res.body.accessToken,
    cookie: extractCookie(res.headers['set-cookie']),
    companyId: res.body.activeCompanyId,
    email,
  };
}

export function extractCookie(header: string | string[] | undefined): string {
  const list = Array.isArray(header) ? header : header ? [header] : [];
  const c = list.find((h) => h.startsWith('fx_rt='));
  if (!c) throw new Error('Sin cookie de refresh');
  return c.split(';')[0];
}

export const auth = (s: Session) => ({ Authorization: `Bearer ${s.token}` });
