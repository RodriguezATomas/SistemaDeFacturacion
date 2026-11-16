/**
 * Código QR de comprobantes electrónicos según la especificación de ARCA (RG 4892):
 * URL https://www.afip.gob.ar/fe/qr/?p=<JSON en base64>.
 */
export const ARCA_QR_BASE_URL = 'https://www.afip.gob.ar/fe/qr/';

export interface QrData {
  issueDate: string; // YYYY-MM-DD
  cuit: string;
  pointOfSale: number;
  voucherType: number;
  number: number;
  total: string;
  currency: string;
  exchangeRate: string;
  receiverDocType?: number;
  receiverDocNumber?: string;
  cae: string;
}

export function buildQrPayload(d: QrData) {
  const payload: Record<string, string | number> = {
    ver: 1,
    fecha: d.issueDate,
    cuit: Number(d.cuit),
    ptoVta: d.pointOfSale,
    tipoCmp: d.voucherType,
    nroCmp: d.number,
    importe: Number(d.total),
    moneda: d.currency,
    ctz: Number(d.exchangeRate),
  };
  // Para receptores sin identificar (DocTipo 99) se omiten tipo y número de documento.
  if (d.receiverDocType && d.receiverDocType !== 99 && d.receiverDocNumber) {
    payload.tipoDocRec = d.receiverDocType;
    payload.nroDocRec = Number(d.receiverDocNumber.replace(/\D/g, ''));
  }
  payload.tipoCodAut = 'E';
  payload.codAut = Number(d.cae);
  return payload;
}

export function buildQrUrl(d: QrData): string {
  const json = JSON.stringify(buildQrPayload(d));
  return `${ARCA_QR_BASE_URL}?p=${Buffer.from(json, 'utf8').toString('base64')}`;
}
