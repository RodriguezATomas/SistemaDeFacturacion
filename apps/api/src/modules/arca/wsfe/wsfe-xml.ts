import { asArray, ArcaServiceError, escapeXml, soapBody } from '../soap/soap-transport';
import { AccessCredentials } from '../wsaa/wsaa.service';

/**
 * Construcción y lectura de mensajes WSFEv1. El orden de los elementos respeta la secuencia
 * del WSDL oficial (https://servicios1.afip.gov.ar/wsfev1/service.asmx?WSDL).
 */

export interface ArcaMessage {
  code: string;
  message: string;
}

export interface CaeRequestDetail {
  pointOfSale: number;
  voucherType: number;
  concept: number;
  docType: number;
  docNumber: string;
  number: number;
  issueDate: string; // yyyymmdd
  total: string;
  netUntaxed: string;
  netTaxed: string;
  exempt: string;
  otherTaxes: string;
  vat: string;
  serviceFrom?: string;
  serviceTo?: string;
  paymentDueDate?: string;
  currency: string;
  exchangeRate: string;
  receiverVatConditionId: number;
  associated?: Array<{ type: number; pointOfSale: number; number: number; cuit?: string; date?: string }>;
  taxes?: Array<{ id: number; description: string; base: string; rate: string; amount: string }>;
  vatBreakdown?: Array<{ id: number; base: string; amount: string }>;
}

export interface CaeResponse {
  result: 'A' | 'R' | 'P' | null;
  cae: string | null;
  caeDueDate: string | null;
  number: number | null;
  observations: ArcaMessage[];
  errors: ArcaMessage[];
  events: ArcaMessage[];
}

export interface ConsultResponse {
  found: boolean;
  cae: string | null;
  caeDueDate: string | null;
  result: string | null;
  total: string | null;
  docType: number | null;
  docNumber: string | null;
  issueDate: string | null;
  errors: ArcaMessage[];
}

const NS = 'xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/"';

export function envelope(operation: string, inner: string): string {
  return `<?xml version="1.0" encoding="utf-8"?><soap:Envelope ${NS}><soap:Body><ar:${operation}>${inner}</ar:${operation}></soap:Body></soap:Envelope>`;
}

export function authXml(auth: AccessCredentials): string {
  return `<ar:Auth><ar:Token>${escapeXml(auth.token)}</ar:Token><ar:Sign>${escapeXml(auth.sign)}</ar:Sign><ar:Cuit>${escapeXml(auth.cuit)}</ar:Cuit></ar:Auth>`;
}

const el = (name: string, value: string | number) => `<ar:${name}>${escapeXml(value)}</ar:${name}>`;

export function buildCaeRequest(auth: AccessCredentials, d: CaeRequestDetail): string {
  let det = '';
  det += el('Concepto', d.concept);
  det += el('DocTipo', d.docType);
  det += el('DocNro', d.docNumber);
  det += el('CbteDesde', d.number);
  det += el('CbteHasta', d.number);
  det += el('CbteFch', d.issueDate);
  det += el('ImpTotal', d.total);
  det += el('ImpTotConc', d.netUntaxed);
  det += el('ImpNeto', d.netTaxed);
  det += el('ImpOpEx', d.exempt);
  det += el('ImpTrib', d.otherTaxes);
  det += el('ImpIVA', d.vat);
  if (d.concept !== 1) {
    if (!d.serviceFrom || !d.serviceTo || !d.paymentDueDate) {
      throw new ArcaServiceError('Para servicios son obligatorias las fechas de servicio y de vencimiento de pago');
    }
    det += el('FchServDesde', d.serviceFrom);
    det += el('FchServHasta', d.serviceTo);
    det += el('FchVtoPago', d.paymentDueDate);
  }
  det += el('MonId', d.currency);
  det += el('MonCotiz', d.exchangeRate);
  if (d.currency !== 'PES') det += el('CanMisMonExt', 'N');
  det += el('CondicionIVAReceptorId', d.receiverVatConditionId);
  if (d.associated?.length) {
    det += '<ar:CbtesAsoc>';
    for (const a of d.associated) {
      det += '<ar:CbteAsoc>';
      det += el('Tipo', a.type) + el('PtoVta', a.pointOfSale) + el('Nro', a.number);
      if (a.cuit) det += el('Cuit', a.cuit);
      if (a.date) det += el('CbteFch', a.date);
      det += '</ar:CbteAsoc>';
    }
    det += '</ar:CbtesAsoc>';
  }
  if (d.taxes?.length) {
    det += '<ar:Tributos>';
    for (const t of d.taxes) {
      det += `<ar:Tributo>${el('Id', t.id)}${el('Desc', t.description)}${el('BaseImp', t.base)}${el('Alic', t.rate)}${el('Importe', t.amount)}</ar:Tributo>`;
    }
    det += '</ar:Tributos>';
  }
  if (d.vatBreakdown?.length) {
    det += '<ar:Iva>';
    for (const v of d.vatBreakdown) {
      det += `<ar:AlicIva>${el('Id', v.id)}${el('BaseImp', v.base)}${el('Importe', v.amount)}</ar:AlicIva>`;
    }
    det += '</ar:Iva>';
  }
  const inner =
    authXml(auth) +
    '<ar:FeCAEReq><ar:FeCabReq>' +
    el('CantReg', 1) +
    el('PtoVta', d.pointOfSale) +
    el('CbteTipo', d.voucherType) +
    `</ar:FeCabReq><ar:FeDetReq><ar:FECAEDetRequest>${det}</ar:FECAEDetRequest></ar:FeDetReq></ar:FeCAEReq>`;
  return envelope('FECAESolicitar', inner);
}

export function buildLastAuthorizedRequest(auth: AccessCredentials, pointOfSale: number, voucherType: number) {
  return envelope('FECompUltimoAutorizado', authXml(auth) + el('PtoVta', pointOfSale) + el('CbteTipo', voucherType));
}

export function buildConsultRequest(auth: AccessCredentials, voucherType: number, pointOfSale: number, number: number) {
  return envelope(
    'FECompConsultar',
    authXml(auth) + `<ar:FeCompConsReq>${el('CbteTipo', voucherType)}${el('CbteNro', number)}${el('PtoVta', pointOfSale)}</ar:FeCompConsReq>`,
  );
}

export function buildPointsOfSaleRequest(auth: AccessCredentials) {
  return envelope('FEParamGetPtosVenta', authXml(auth));
}

export function buildDummyRequest() {
  return envelope('FEDummy', '');
}

type Node = Record<string, unknown>;

function messages(container: unknown, key: string): ArcaMessage[] {
  const node = container as Node | undefined;
  return asArray(node?.[key] as Node | Node[] | undefined).map((m) => ({
    code: String(m.Code ?? ''),
    message: String(m.Msg ?? ''),
  }));
}

function result(xml: string, operation: string): Node {
  const body = soapBody(xml);
  const res = (body[`${operation}Response`] as Node | undefined)?.[`${operation}Result`] as Node | undefined;
  if (!res) throw new ArcaServiceError(`Respuesta de ${operation} sin resultado`);
  return res;
}

export function parseCaeResponse(xml: string): CaeResponse {
  const res = result(xml, 'FECAESolicitar');
  const errors = messages(res.Errors, 'Err');
  const events = messages(res.Events, 'Evt');
  const detail = asArray((res.FeDetResp as Node | undefined)?.FECAEDetResponse as Node | Node[] | undefined)[0];
  if (!detail) {
    return { result: errors.length ? 'R' : null, cae: null, caeDueDate: null, number: null, observations: [], errors, events };
  }
  const r = String(detail.Resultado ?? '') as CaeResponse['result'];
  const cae = String(detail.CAE ?? '').trim();
  return {
    result: r === 'A' || r === 'R' || r === 'P' ? r : null,
    cae: cae || null,
    caeDueDate: String(detail.CAEFchVto ?? '').trim() || null,
    number: detail.CbteDesde ? Number(detail.CbteDesde) : null,
    observations: messages(detail.Observaciones, 'Obs'),
    errors,
    events,
  };
}

export function parseLastAuthorized(xml: string): number {
  const res = result(xml, 'FECompUltimoAutorizado');
  const errors = messages(res.Errors, 'Err');
  if (errors.length) {
    throw new ArcaServiceError(errors.map((e) => `[${e.code}] ${e.message}`).join('; '), errors[0].code);
  }
  const nro = Number(res.CbteNro);
  if (!Number.isInteger(nro) || nro < 0) throw new ArcaServiceError('Número de último comprobante inválido');
  return nro;
}

/** Código 602: no existe el comprobante consultado. */
export const NOT_FOUND_CODE = '602';

export function parseConsult(xml: string): ConsultResponse {
  const res = result(xml, 'FECompConsultar');
  const errors = messages(res.Errors, 'Err');
  const get = res.ResultGet as Node | undefined;
  if (!get || errors.some((e) => e.code === NOT_FOUND_CODE)) {
    if (errors.length && !errors.some((e) => e.code === NOT_FOUND_CODE)) {
      throw new ArcaServiceError(errors.map((e) => `[${e.code}] ${e.message}`).join('; '), errors[0].code);
    }
    return { found: false, cae: null, caeDueDate: null, result: null, total: null, docType: null, docNumber: null, issueDate: null, errors };
  }
  return {
    found: true,
    cae: String(get.CodAutorizacion ?? '').trim() || null,
    caeDueDate: String(get.FchVto ?? '').trim() || null,
    result: String(get.Resultado ?? '') || null,
    total: get.ImpTotal !== undefined ? String(get.ImpTotal) : null,
    docType: get.DocTipo !== undefined ? Number(get.DocTipo) : null,
    docNumber: get.DocNro !== undefined ? String(get.DocNro) : null,
    issueDate: get.CbteFch !== undefined ? String(get.CbteFch) : null,
    errors,
  };
}

export function parsePointsOfSale(xml: string) {
  const res = result(xml, 'FEParamGetPtosVenta');
  const errors = messages(res.Errors, 'Err');
  // Error 602 = sin puntos de venta habilitados para web services.
  if (errors.length && !errors.some((e) => e.code === NOT_FOUND_CODE)) {
    throw new ArcaServiceError(errors.map((e) => `[${e.code}] ${e.message}`).join('; '), errors[0].code);
  }
  return asArray((res.ResultGet as Node | undefined)?.PtoVenta as Node | Node[] | undefined).map((p) => ({
    number: Number(p.Nro),
    emissionType: String(p.EmisionTipo ?? ''),
    blocked: String(p.Bloqueado ?? '') === 'S',
    deactivatedAt: p.FchBaja && String(p.FchBaja) !== 'NULL' ? String(p.FchBaja) : null,
  }));
}

export function parseDummy(xml: string) {
  const res = result(xml, 'FEDummy');
  return {
    appServer: String(res.AppServer ?? ''),
    dbServer: String(res.DbServer ?? ''),
    authServer: String(res.AuthServer ?? ''),
  };
}
