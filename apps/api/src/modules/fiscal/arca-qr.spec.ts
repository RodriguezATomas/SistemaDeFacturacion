import { buildQrPayload, buildQrUrl } from './arca-qr';

describe('QR ARCA', () => {
  const data = {
    issueDate: '2026-11-16',
    cuit: '20123456786',
    pointOfSale: 3,
    voucherType: 1,
    number: 125,
    total: '12100.00',
    currency: 'PES',
    exchangeRate: '1',
    receiverDocType: 80,
    receiverDocNumber: '30-50001091-2',
    cae: '76123456789012',
  };

  it('arma el JSON con los campos y tipos de la especificación', () => {
    expect(buildQrPayload(data)).toEqual({
      ver: 1,
      fecha: '2026-11-16',
      cuit: 20123456786,
      ptoVta: 3,
      tipoCmp: 1,
      nroCmp: 125,
      importe: 12100,
      moneda: 'PES',
      ctz: 1,
      tipoDocRec: 80,
      nroDocRec: 30500010912,
      tipoCodAut: 'E',
      codAut: 76123456789012,
    });
  });

  it('omite el documento del receptor sin identificar', () => {
    const p = buildQrPayload({ ...data, receiverDocType: 99, receiverDocNumber: '0' });
    expect(p).not.toHaveProperty('tipoDocRec');
    expect(p).not.toHaveProperty('nroDocRec');
  });

  it('genera la URL con el JSON en base64', () => {
    const url = buildQrUrl(data);
    expect(url.startsWith('https://www.afip.gob.ar/fe/qr/?p=')).toBe(true);
    const decoded = JSON.parse(Buffer.from(url.split('?p=')[1], 'base64').toString('utf8'));
    expect(decoded.codAut).toBe(76123456789012);
  });
});
