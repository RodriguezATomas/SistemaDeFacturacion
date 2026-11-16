import { ArcaServiceError } from '../soap/soap-transport';
import {
  buildCaeRequest,
  CaeRequestDetail,
  parseCaeResponse,
  parseConsult,
  parseLastAuthorized,
  parsePointsOfSale,
} from './wsfe-xml';

const auth = { token: 'TOKEN', sign: 'SIGN', cuit: '20123456786' };

const wrap = (op: string, inner: string) =>
  `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><${op}Response xmlns="http://ar.gov.afip.dif.FEV1/"><${op}Result>${inner}</${op}Result></${op}Response></soap:Body></soap:Envelope>`;

const detail: CaeRequestDetail = {
  pointOfSale: 3,
  voucherType: 1,
  concept: 1,
  docType: 80,
  docNumber: '30500010912',
  number: 18,
  issueDate: '20261116',
  total: '121.00',
  netUntaxed: '0.00',
  netTaxed: '100.00',
  exempt: '0.00',
  otherTaxes: '0.00',
  vat: '21.00',
  currency: 'PES',
  exchangeRate: '1',
  receiverVatConditionId: 1,
  vatBreakdown: [{ id: 5, base: '100.00', amount: '21.00' }],
};

describe('WSFEv1 XML', () => {
  it('arma FECAESolicitar respetando el orden del WSDL', () => {
    const xml = buildCaeRequest(auth, detail);
    const order = [
      'Concepto', 'DocTipo', 'DocNro', 'CbteDesde', 'CbteHasta', 'CbteFch', 'ImpTotal', 'ImpTotConc',
      'ImpNeto', 'ImpOpEx', 'ImpTrib', 'ImpIVA', 'MonId', 'MonCotiz', 'CondicionIVAReceptorId', 'Iva',
    ];
    const positions = order.map((tag) => xml.indexOf(`<ar:${tag}>`));
    expect(positions.every((p) => p > 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(xml).toContain('<ar:CbteTipo>1</ar:CbteTipo>');
    expect(xml).toContain('<ar:AlicIva><ar:Id>5</ar:Id><ar:BaseImp>100.00</ar:BaseImp><ar:Importe>21.00</ar:Importe></ar:AlicIva>');
    expect(xml).not.toContain('FchServDesde');
  });

  it('exige fechas de servicio para concepto servicios', () => {
    expect(() => buildCaeRequest(auth, { ...detail, concept: 2 })).toThrow(ArcaServiceError);
    const xml = buildCaeRequest(auth, {
      ...detail,
      concept: 2,
      serviceFrom: '20261101',
      serviceTo: '20261130',
      paymentDueDate: '20261210',
    });
    expect(xml.indexOf('<ar:FchServDesde>')).toBeGreaterThan(xml.indexOf('<ar:ImpIVA>'));
    expect(xml.indexOf('<ar:FchVtoPago>')).toBeLessThan(xml.indexOf('<ar:MonId>'));
  });

  it('incluye comprobantes asociados para notas y escapa caracteres', () => {
    const xml = buildCaeRequest(auth, {
      ...detail,
      voucherType: 3,
      associated: [{ type: 1, pointOfSale: 3, number: 17, cuit: '20123456786', date: '20261110' }],
      taxes: [{ id: 99, description: 'Tasa <municipal> & otros', base: '100.00', rate: '1.00', amount: '1.00' }],
    });
    expect(xml).toContain('<ar:CbteAsoc><ar:Tipo>1</ar:Tipo><ar:PtoVta>3</ar:PtoVta><ar:Nro>17</ar:Nro>');
    expect(xml).toContain('Tasa &lt;municipal&gt; &amp; otros');
    expect(xml.indexOf('<ar:CbtesAsoc>')).toBeLessThan(xml.indexOf('<ar:Tributos>'));
    expect(xml.indexOf('<ar:Tributos>')).toBeLessThan(xml.indexOf('<ar:Iva>'));
  });

  it('interpreta una autorización aprobada preservando el CAE completo', () => {
    const xml = wrap(
      'FECAESolicitar',
      '<FeCabResp><Cuit>20123456786</Cuit><PtoVta>3</PtoVta><CbteTipo>1</CbteTipo><Resultado>A</Resultado></FeCabResp>' +
        '<FeDetResp><FECAEDetResponse><Concepto>1</Concepto><CbteDesde>18</CbteDesde><CbteHasta>18</CbteHasta><Resultado>A</Resultado>' +
        '<Observaciones><Obs><Code>10217</Code><Msg>Observación informativa</Msg></Obs></Observaciones>' +
        '<CAE>76123456789012</CAE><CAEFchVto>20261126</CAEFchVto></FECAEDetResponse></FeDetResp>',
    );
    const r = parseCaeResponse(xml);
    expect(r.result).toBe('A');
    expect(r.cae).toBe('76123456789012');
    expect(r.caeDueDate).toBe('20261126');
    expect(r.number).toBe(18);
    expect(r.observations).toEqual([{ code: '10217', message: 'Observación informativa' }]);
  });

  it('interpreta un rechazo con observaciones', () => {
    const xml = wrap(
      'FECAESolicitar',
      '<FeCabResp><Resultado>R</Resultado></FeCabResp><FeDetResp><FECAEDetResponse><Resultado>R</Resultado>' +
        '<Observaciones><Obs><Code>10015</Code><Msg>DocNro inválido</Msg></Obs><Obs><Code>10013</Code><Msg>Otro</Msg></Obs></Observaciones>' +
        '<CAE></CAE><CAEFchVto></CAEFchVto></FECAEDetResponse></FeDetResp>',
    );
    const r = parseCaeResponse(xml);
    expect(r.result).toBe('R');
    expect(r.cae).toBeNull();
    expect(r.observations).toHaveLength(2);
  });

  it('trata errores sin detalle como rechazo', () => {
    const xml = wrap('FECAESolicitar', '<Errors><Err><Code>10016</Code><Msg>El número no es el próximo a autorizar</Msg></Err></Errors>');
    const r = parseCaeResponse(xml);
    expect(r.result).toBe('R');
    expect(r.errors[0].code).toBe('10016');
  });

  it('lanza error ante un SOAP Fault', () => {
    const fault =
      '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><soap:Fault><faultcode>soap:Server</faultcode><faultstring>Error interno</faultstring></soap:Fault></soap:Body></soap:Envelope>';
    expect(() => parseCaeResponse(fault)).toThrow('Error interno');
  });

  it('lee el último comprobante autorizado y sus errores', () => {
    expect(parseLastAuthorized(wrap('FECompUltimoAutorizado', '<PtoVta>3</PtoVta><CbteTipo>1</CbteTipo><CbteNro>17</CbteNro>'))).toBe(17);
    expect(() =>
      parseLastAuthorized(wrap('FECompUltimoAutorizado', '<Errors><Err><Code>600</Code><Msg>No autorizado</Msg></Err></Errors>')),
    ).toThrow(/600/);
  });

  it('interpreta consultas existentes e inexistentes', () => {
    const found = parseConsult(
      wrap(
        'FECompConsultar',
        '<ResultGet><Concepto>1</Concepto><DocTipo>80</DocTipo><DocNro>30500010912</DocNro><CbteFch>20261116</CbteFch><ImpTotal>121</ImpTotal><Resultado>A</Resultado><CodAutorizacion>76123456789012</CodAutorizacion><FchVto>20261126</FchVto></ResultGet>',
      ),
    );
    expect(found).toMatchObject({ found: true, cae: '76123456789012', total: '121', docNumber: '30500010912' });

    const missing = parseConsult(wrap('FECompConsultar', '<Errors><Err><Code>602</Code><Msg>No existen datos</Msg></Err></Errors>'));
    expect(missing.found).toBe(false);
  });

  it('lista puntos de venta habilitados', () => {
    const r = parsePointsOfSale(
      wrap(
        'FEParamGetPtosVenta',
        '<ResultGet><PtoVenta><Nro>3</Nro><EmisionTipo>CAE - Ws</EmisionTipo><Bloqueado>N</Bloqueado><FchBaja>NULL</FchBaja></PtoVenta></ResultGet>',
      ),
    );
    expect(r).toEqual([{ number: 3, emissionType: 'CAE - Ws', blocked: false, deactivatedAt: null }]);
  });
});
