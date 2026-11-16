import { ArcaCallContext } from '../src/modules/arca/arca-log.service';
import { ArcaTransportError } from '../src/modules/arca/soap/soap-transport';
import { AccessCredentials } from '../src/modules/arca/wsaa/wsaa.service';
import { buildCaeRequest, CaeRequestDetail, CaeResponse, ConsultResponse } from '../src/modules/arca/wsfe/wsfe-xml';

export type FakeMode =
  | 'approve'
  | 'reject'
  | 'not-sent' // falla de conexión antes de enviar
  | 'timeout-authorized' // ARCA autorizó pero la respuesta se perdió
  | 'timeout-lost'; // se envió pero ARCA no lo procesó

interface Stored {
  cae: string;
  total: string;
  docNumber: string;
  date: string;
}

/**
 * Doble de prueba de WsfeService para pruebas de integración (no se usa en la aplicación).
 * Reproduce la semántica de ARCA: numeración por punto de venta/tipo, CAE por comprobante y
 * consulta posterior. El XML de solicitud se arma con el constructor real.
 */
export class FakeWsfe {
  mode: FakeMode = 'approve';
  sendCount = 0;
  private last = new Map<string, number>();
  private authorized = new Map<string, Stored>();
  private caeSeq = 76000000000000;

  reset() {
    this.mode = 'approve';
    this.sendCount = 0;
  }

  async access(_ctx: ArcaCallContext): Promise<AccessCredentials> {
    return { token: 'fake-token', sign: 'fake-sign', cuit: '30500010912' };
  }

  async lastAuthorized(ctx: ArcaCallContext, pos: number, type: number): Promise<number> {
    return this.last.get(`${ctx.companyId}:${pos}:${type}`) ?? 0;
  }

  prepareCaeRequest(auth: AccessCredentials, detail: CaeRequestDetail): string {
    return buildCaeRequest(auth, detail);
  }

  async sendCaeRequest(ctx: ArcaCallContext, xml: string): Promise<CaeResponse> {
    const tag = (name: string) => new RegExp(`<ar:${name}>([^<]*)</ar:${name}>`).exec(xml)?.[1] ?? '';
    const pos = Number(tag('PtoVta'));
    const type = Number(tag('CbteTipo'));
    const number = Number(tag('CbteDesde'));
    const key = `${ctx.companyId}:${pos}:${type}`;

    if (this.mode === 'not-sent') throw new ArcaTransportError('ECONNREFUSED', false);
    this.sendCount++;
    if ((this.last.get(key) ?? 0) + 1 !== number) {
      return { result: 'R', cae: null, caeDueDate: null, number: null, observations: [], errors: [{ code: '10016', message: 'Número no correlativo' }], events: [] };
    }
    if (this.mode === 'reject') {
      return { result: 'R', cae: null, caeDueDate: null, number, observations: [{ code: '10015', message: 'Documento del receptor inválido' }], errors: [], events: [] };
    }
    if (this.mode === 'timeout-lost') throw new ArcaTransportError('Tiempo de espera agotado', true, true);

    const cae = String(++this.caeSeq);
    this.last.set(key, number);
    this.authorized.set(`${key}:${number}`, { cae, total: tag('ImpTotal'), docNumber: tag('DocNro'), date: tag('CbteFch') });
    if (this.mode === 'timeout-authorized') throw new ArcaTransportError('Tiempo de espera agotado', true, true);
    return { result: 'A', cae, caeDueDate: '20991231', number, observations: [], errors: [], events: [] };
  }

  async consult(ctx: ArcaCallContext, type: number, pos: number, number: number): Promise<ConsultResponse> {
    const s = this.authorized.get(`${ctx.companyId}:${pos}:${type}:${number}`);
    if (!s) return { found: false, cae: null, caeDueDate: null, result: null, total: null, docType: null, docNumber: null, issueDate: null, errors: [{ code: '602', message: 'No existe' }] };
    return { found: true, cae: s.cae, caeDueDate: '20991231', result: 'A', total: s.total, docType: 80, docNumber: s.docNumber, issueDate: s.date, errors: [] };
  }

  async pointsOfSale() {
    return [{ number: 3, emissionType: 'CAE - Ws', blocked: false, deactivatedAt: null }];
  }

  async dummy() {
    return { appServer: 'OK', dbServer: 'OK', authServer: 'OK' };
  }
}
