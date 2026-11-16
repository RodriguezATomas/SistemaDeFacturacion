import { request } from 'https';
import { XMLParser } from 'fast-xml-parser';

/**
 * Error de transporte con ARCA. `requestSent` indica si la solicitud llegó a enviarse:
 * - false → falló la conexión (DNS, TCP, TLS): ARCA no recibió nada, es seguro reintentar.
 * - true  → se envió y no hubo respuesta válida (timeout, corte): el resultado es INCIERTO
 *           y debe conciliarse antes de reintentar una emisión.
 */
export class ArcaTransportError extends Error {
  constructor(
    message: string,
    readonly requestSent: boolean,
    readonly timedOut = false,
  ) {
    super(message);
    this.name = 'ArcaTransportError';
  }
}

/** Error funcional devuelto por ARCA (SOAP Fault o respuesta con errores). */
export class ArcaServiceError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ArcaServiceError';
  }
}

export interface SoapResponse {
  status: number;
  body: string;
  durationMs: number;
}

export interface SoapOptions {
  timeoutMs: number;
  ciphers?: string;
}

export function soapPost(url: string, xml: string, soapAction: string, opts: SoapOptions): Promise<SoapResponse> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    let sent = false;
    let settled = false;
    const fail = (err: ArcaTransportError) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      reject(err);
    };

    const req = request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: `${u.pathname}${u.search}`,
        method: 'POST',
        ciphers: opts.ciphers,
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: `"${soapAction}"`,
          'Content-Length': Buffer.byteLength(xml, 'utf8'),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          if (settled) return;
          settled = true;
          clearTimeout(deadline);
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
            durationMs: Date.now() - started,
          });
        });
        res.on('error', (e) => fail(new ArcaTransportError(`Respuesta interrumpida: ${e.message}`, true)));
      },
    );

    const deadline = setTimeout(() => {
      fail(new ArcaTransportError(`Tiempo de espera agotado (${opts.timeoutMs} ms)`, sent, true));
      req.destroy();
    }, opts.timeoutMs);

    req.on('finish', () => {
      sent = true;
    });
    req.on('error', (e) =>
      fail(new ArcaTransportError(`Error de comunicación con ARCA: ${e.message}`, sent)),
    );
    req.write(xml, 'utf8');
    req.end();
  });
}

const parser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
});

/** Parsea XML preservando todos los valores como texto (CAE y CUIT no deben perder precisión). */
export function parseXml(xml: string): Record<string, unknown> {
  return parser.parse(xml) as Record<string, unknown>;
}

export function escapeXml(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Obtiene el Body de un sobre SOAP y lanza ArcaServiceError si contiene un Fault. */
export function soapBody(xml: string): Record<string, unknown> {
  let doc: Record<string, unknown>;
  try {
    doc = parseXml(xml);
  } catch {
    throw new ArcaServiceError('Respuesta de ARCA con formato XML inválido');
  }
  const envelope = doc.Envelope as Record<string, unknown> | undefined;
  const body = envelope?.Body as Record<string, unknown> | undefined;
  if (!body) throw new ArcaServiceError('Respuesta de ARCA sin sobre SOAP');
  const fault = body.Fault as Record<string, unknown> | undefined;
  if (fault) {
    const code = String(fault.faultcode ?? '');
    throw new ArcaServiceError(String(fault.faultstring ?? 'Error SOAP de ARCA'), code);
  }
  return body;
}

/** Normaliza nodos que pueden venir como objeto único o lista. */
export function asArray<T>(value: T | T[] | undefined | null | ''): T[] {
  if (value === undefined || value === null || value === '') return [];
  return Array.isArray(value) ? value : [value];
}
