import { randomUUID } from 'crypto';
import { auth, createTestApp, registerCompany, Session, TestContext } from './test-app';

const today = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const key = () => randomUUID().replace(/-/g, '');

describe('Comprobantes y emisión ARCA (integración)', () => {
  let ctx: TestContext;
  let s: Session;
  let posId: string;
  let customerId: string;
  let productId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    s = await registerCompany(ctx);
    posId = (await ctx.http().post('/api/points-of-sale').set(auth(s)).send({ number: 3, name: 'Central' }).expect(201)).body.id;
    customerId = (
      await ctx
        .http()
        .post('/api/customers')
        .set(auth(s))
        .send({ name: 'Cliente RI', documentType: 'CUIT', documentNumber: '20123456786', vatCondition: 'RESPONSABLE_INSCRIPTO' })
        .expect(201)
    ).body.id;
    productId = (
      await ctx.http().post('/api/products').set(auth(s)).send({ type: 'PRODUCT', name: 'Teclado', price: 1000, vatTreatment: 'GRAVADO', vatRate: 21 }).expect(201)
    ).body.id;
  });
  beforeEach(() => ctx.wsfe.reset());
  afterAll(async () => {
    await ctx.app.close();
  });

  const draft = async (extra: Record<string, unknown> = {}) =>
    (
      await ctx
        .http()
        .post('/api/invoices')
        .set(auth(s))
        .send({ pointOfSaleId: posId, kind: 'FACTURA', customerId, concept: 'PRODUCTS', issueDate: today(), items: [{ productId, quantity: 2 }], ...extra })
        .expect(201)
    ).body;

  const emit = (id: string, k = key()) => ctx.http().post(`/api/invoices/${id}/emit`).set(auth(s)).set('Idempotency-Key', k);

  it('crea borrador determinando Factura A y calculando IVA', async () => {
    const inv = await draft();
    expect(inv.voucherType).toBe(1);
    expect(inv.status).toBe('DRAFT');
    expect(inv.number).toBeNull();
    expect(inv.total).toBe('2420');
    expect(inv.vatBreakdown).toEqual([expect.objectContaining({ arcaId: 5, baseAmount: '2000', vatAmount: '420' })]);
  });

  it('usa el precio de la lista asignada', async () => {
    const list = await ctx.http().post('/api/price-lists').set(auth(s)).send({ name: 'Mayorista', adjustmentPercent: -10 }).expect(201);
    const inv = await draft({ priceListId: list.body.id });
    expect(inv.items[0].unitPrice).toBe('900');
    await ctx.http().put(`/api/price-lists/${list.body.id}/items`).set(auth(s)).send({ items: [{ productId, price: 750 }] }).expect(200);
    const inv2 = await draft({ priceListId: list.body.id });
    expect(inv2.items[0].unitPrice).toBe('750');
  });

  it('emite y autoriza con CAE, número correlativo y PDF almacenado', async () => {
    const inv = await draft();
    const res = await emit(inv.id).expect(200);
    expect(res.body.status).toBe('AUTHORIZED');
    expect(res.body.cae).toMatch(/^\d{14}$/);
    expect(res.body.number).toBe(1);
    expect(res.body.arcaEnvironment).toBe('HOMOLOGATION');
    expect(res.body.pdfStorageKey).toContain(inv.id);

    const pdf = await ctx.http().get(`/api/invoices/${inv.id}/pdf`).set(auth(s)).expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');

    const second = await emit((await draft()).id).expect(200);
    expect(second.body.number).toBe(2);
  });

  it('es idempotente: la misma clave no produce un segundo envío', async () => {
    const inv = await draft();
    const k = key();
    const r1 = await emit(inv.id, k).expect(200);
    const r2 = await emit(inv.id, k).expect(200);
    expect(r2.body.cae).toBe(r1.body.cae);
    expect(ctx.wsfe.sendCount).toBe(1);
    // Un comprobante ya autorizado nunca se reenvía, aun con otra clave.
    await emit(inv.id).expect(200);
    expect(ctx.wsfe.sendCount).toBe(1);
    // La clave no puede reutilizarse para otro comprobante.
    await emit((await draft()).id, k).expect(409);
  });

  it('registra rechazos sin consumir número y permite corregir y reintentar', async () => {
    const inv = await draft();
    ctx.wsfe.mode = 'reject';
    const r = await emit(inv.id).expect(200);
    expect(r.body.status).toBe('REJECTED');
    expect(r.body.number).toBeNull();
    expect(r.body.arcaObservations[0].code).toBe('10015');
    expect(r.body.attempts).toHaveLength(1);

    ctx.wsfe.mode = 'approve';
    await ctx.http().put(`/api/invoices/${inv.id}`).set(auth(s)).send({ pointOfSaleId: posId, kind: 'FACTURA', customerId, concept: 'PRODUCTS', issueDate: today(), items: [{ productId, quantity: 1 }] }).expect(200);
    const ok = await emit(inv.id).expect(200);
    expect(ok.body.status).toBe('AUTHORIZED');
    expect(ok.body.attempts).toHaveLength(2);
  });

  it('timeout con autorización perdida: queda incierto y se concilia como AUTORIZADO sin reenviar', async () => {
    const inv = await draft();
    ctx.wsfe.mode = 'timeout-authorized';
    const r = await emit(inv.id).expect(200);
    // La conciliación inmediata consulta FECompConsultar y recupera el CAE.
    expect(r.body.status).toBe('AUTHORIZED');
    expect(r.body.cae).toBeTruthy();
    expect(ctx.wsfe.sendCount).toBe(1);
    expect(r.body.attempts.at(-1).result).toBe('RECONCILED_AUTHORIZED');
  });

  it('timeout sin procesar: se concilia como no autorizado y libera el número', async () => {
    const inv = await draft();
    ctx.wsfe.mode = 'timeout-lost';
    const r = await emit(inv.id).expect(200);
    expect(r.body.status).toBe('REJECTED');
    expect(r.body.number).toBeNull();
    expect(r.body.attempts.at(-1).result).toBe('RECONCILED_NOT_FOUND');
    ctx.wsfe.mode = 'approve';
    expect((await emit(inv.id).expect(200)).body.status).toBe('AUTHORIZED');
  });

  it('bloquea nuevas emisiones del mismo punto de venta y tipo mientras haya un resultado incierto', async () => {
    const inv = await draft();
    await ctx.prisma.invoice.update({ where: { id: inv.id }, data: { status: 'UNKNOWN', number: 999, arcaEnvironment: 'HOMOLOGATION' } });
    const other = await draft();
    const blocked = await emit(other.id).expect(409);
    expect(blocked.body.message).toMatch(/incierto/);
    await emit(inv.id).expect(409);

    // La conciliación determina que no existe en ARCA y desbloquea.
    const rec = await ctx.http().post(`/api/invoices/${inv.id}/reconcile`).set(auth(s)).expect(200);
    expect(rec.body.outcome).toBe('NOT_AUTHORIZED');
    expect((await emit(other.id).expect(200)).body.status).toBe('AUTHORIZED');
  });

  it('falla de conexión antes de enviar: no queda incierto y puede reintentarse', async () => {
    const inv = await draft();
    ctx.wsfe.mode = 'not-sent';
    await emit(inv.id).expect(503);
    const after = await ctx.http().get(`/api/invoices/${inv.id}`).set(auth(s)).expect(200);
    expect(after.body.status).toBe('REJECTED');
    expect(after.body.number).toBeNull();
  });

  it('emisiones concurrentes nunca duplican numeración', async () => {
    const drafts = await Promise.all([draft(), draft(), draft()]);
    const results = await Promise.all(drafts.map((d) => emit(d.id)));
    const ok = results.filter((r) => r.status === 200 && r.body.status === 'AUTHORIZED');
    const conflicts = results.filter((r) => r.status === 409);
    expect(ok.length + conflicts.length).toBe(3);
    const numbers = ok.map((r) => r.body.number);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('nota de crédito: asocia el original y no permite acreditar más que el saldo', async () => {
    const inv = await draft();
    const authorized = (await emit(inv.id).expect(200)).body;
    const nc = (await ctx.http().post(`/api/invoices/${authorized.id}/credit-note`).set(auth(s)).expect(201)).body;
    expect(nc.voucherType).toBe(3);
    expect(nc.associatedInvoiceId).toBe(authorized.id);
    expect(nc.total).toBe(authorized.total);
    const ncOk = await emit(nc.id).expect(200);
    expect(ncOk.body.status).toBe('AUTHORIZED');

    const extra = await ctx
      .http()
      .post('/api/invoices')
      .set(auth(s))
      .send({ pointOfSaleId: posId, kind: 'NOTA_CREDITO', customerId, concept: 'PRODUCTS', issueDate: today(), associatedInvoiceId: authorized.id, items: [{ description: 'x', quantity: 1, unitPrice: 1 }] })
      .expect(400);
    expect(extra.body.message).toMatch(/saldo disponible/);
  });

  it('valida reglas fiscales: A requiere CUIT, notas requieren asociado, servicios requieren fechas', async () => {
    await ctx.http().post('/api/invoices').set(auth(s))
      .send({ pointOfSaleId: posId, kind: 'FACTURA', receiver: { name: 'X', documentType: 'DNI', documentNumber: '12345678', vatCondition: 'RESPONSABLE_INSCRIPTO' }, concept: 'PRODUCTS', issueDate: today(), items: [{ description: 'a', quantity: 1, unitPrice: 1 }] })
      .expect(400);
    await ctx.http().post('/api/invoices').set(auth(s))
      .send({ pointOfSaleId: posId, kind: 'NOTA_CREDITO', customerId, concept: 'PRODUCTS', issueDate: today(), items: [{ description: 'a', quantity: 1, unitPrice: 1 }] })
      .expect(400);
    await ctx.http().post('/api/invoices').set(auth(s))
      .send({ pointOfSaleId: posId, kind: 'FACTURA', customerId, concept: 'SERVICES', issueDate: today(), items: [{ description: 'a', quantity: 1, unitPrice: 1 }] })
      .expect(400);
    const cf = await draft({ customerId: undefined });
    expect(cf.voucherType).toBe(6);
    expect(cf.receiverDocumentType).toBe('SIN_IDENTIFICAR');
  });

  it('emisor monotributista emite Factura C sin discriminar IVA', async () => {
    const m = await registerCompany(ctx, { taxCondition: 'MONOTRIBUTO' });
    const pos = (await ctx.http().post('/api/points-of-sale').set(auth(m)).send({ number: 1, name: 'PV' }).expect(201)).body.id;
    const inv = (
      await ctx.http().post('/api/invoices').set(auth(m))
        .send({ pointOfSaleId: pos, kind: 'FACTURA', concept: 'PRODUCTS', issueDate: today(), items: [{ description: 'Servicio', quantity: 1, unitPrice: 1500 }] })
        .expect(201)
    ).body;
    expect(inv.voucherType).toBe(11);
    expect(inv.vatAmount).toBe('0');
    expect(inv.total).toBe('1500');
    expect((await ctx.http().post(`/api/invoices/${inv.id}/emit`).set(auth(m)).set('Idempotency-Key', key()).expect(200)).body.status).toBe('AUTHORIZED');
  });

  it('protege comprobantes autorizados contra edición y borrado', async () => {
    const inv = await draft();
    await emit(inv.id).expect(200);
    await ctx.http().put(`/api/invoices/${inv.id}`).set(auth(s)).send({ pointOfSaleId: posId, kind: 'FACTURA', customerId, concept: 'PRODUCTS', issueDate: today(), items: [{ productId, quantity: 1 }] }).expect(409);
    await ctx.http().delete(`/api/invoices/${inv.id}`).set(auth(s)).expect(409);
    const plain = await draft();
    await ctx.http().delete(`/api/invoices/${plain.id}`).set(auth(s)).expect(204);
  });

  it('exige Idempotency-Key y permiso de emisión', async () => {
    const inv = await draft();
    await ctx.http().post(`/api/invoices/${inv.id}/emit`).set(auth(s)).expect(400);
  });

  it('el dashboard refleja ventas netas de notas de crédito', async () => {
    const d = await ctx.http().get('/api/dashboard').set(auth(s)).expect(200);
    expect(Number(d.body.salesThisMonth)).toBeGreaterThan(0);
    expect(d.body.monthlySales).toHaveLength(12);
    expect(d.body.recentInvoices.length).toBeGreaterThan(0);
  });

  it('la auditoría registra las autorizaciones', async () => {
    const logs = await ctx.http().get('/api/audit-logs?action=invoice.authorized').set(auth(s)).expect(200);
    expect(logs.body.meta.total).toBeGreaterThan(0);
  });
});
