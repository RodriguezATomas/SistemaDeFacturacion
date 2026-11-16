import * as forge from 'node-forge';
import { redactSecrets } from '../arca-log.service';
import { parseLoginResponse } from './wsaa.service';
import {
  buildTra,
  generateKeyAndCsr,
  inspectCertificate,
  keyMatchesCertificate,
  signTra,
  toArcaDateTime,
} from './wsaa-crypto';

/** Certificado autofirmado generado en la prueba (no es un certificado de ARCA). */
function selfSigned(cuit: string, days = 365) {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 0x10001 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 1000);
  cert.validity.notAfter = new Date(Date.now() + days * 86400000);
  const attrs = [
    { name: 'commonName', value: 'prueba' },
    { type: '2.5.4.5', value: `CUIT ${cuit}` },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { certPem: forge.pki.certificateToPem(cert), keyPem: forge.pki.privateKeyToPem(keys.privateKey) };
}

describe('WSAA', () => {
  const { certPem, keyPem } = selfSigned('20123456786');

  it('formatea fechas con huso horario de Argentina', () => {
    expect(toArcaDateTime(new Date('2026-11-16T15:00:00Z'))).toBe('2026-11-16T12:00:00-03:00');
  });

  it('arma el TRA con ventana de validez y servicio', () => {
    const tra = buildTra('wsfe', new Date('2026-11-16T15:00:00Z'));
    expect(tra).toContain('<service>wsfe</service>');
    expect(tra).toContain('<generationTime>2026-11-16T11:50:00-03:00</generationTime>');
    expect(tra).toContain('<expirationTime>2026-11-16T12:10:00-03:00</expirationTime>');
  });

  it('firma el TRA como CMS SignedData con el contenido incluido', () => {
    const tra = buildTra('wsfe');
    const cms = signTra(tra, certPem, keyPem);
    const der = forge.util.decode64(cms);
    const msg = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(der)) as forge.pkcs7.PkcsSignedData;
    expect(msg.certificates).toHaveLength(1);
    expect(forge.pki.certificateToPem(msg.certificates[0])).toBe(forge.pki.certificateToPem(forge.pki.certificateFromPem(certPem)));
    // Firma "attached": el TRA viaja dentro del CMS, como exige WSAA.
    expect(der).toContain('<loginTicketRequest');
  });

  it('inspecciona certificados y extrae la CUIT', () => {
    const info = inspectCertificate(certPem);
    expect(info.cuit).toBe('20123456786');
    expect(info.validTo.getTime()).toBeGreaterThan(Date.now());
    expect(() => inspectCertificate('no es un certificado')).toThrow();
  });

  it('verifica correspondencia clave/certificado', () => {
    expect(keyMatchesCertificate(certPem, keyPem)).toBe(true);
    const other = selfSigned('20123456786');
    expect(keyMatchesCertificate(certPem, other.keyPem)).toBe(false);
  });

  it('genera CSR con CUIT en serialNumber', () => {
    const { csrPem, privateKeyPem } = generateKeyAndCsr({ cuit: '20123456786', organization: 'Empresa', alias: 'sistema' });
    const csr = forge.pki.certificationRequestFromPem(csrPem);
    expect(csr.verify()).toBe(true);
    expect(csr.subject.getField({ type: '2.5.4.5' }).value).toBe('CUIT 20123456786');
    expect(privateKeyPem).toContain('PRIVATE KEY');
  }, 30000);

  it('interpreta la respuesta de loginCms', () => {
    const inner =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><loginTicketResponse version="1.0"><header><source>CN=wsaahomo</source><destination>SERIALNUMBER=CUIT 20123456786</destination><uniqueId>1</uniqueId><generationTime>2026-11-16T12:00:00.000-03:00</generationTime><expirationTime>2026-11-17T00:00:00.000-03:00</expirationTime></header><credentials><token>TOK</token><sign>SIG</sign></credentials></loginTicketResponse>';
    const escaped = inner.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const xml = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><loginCmsResponse xmlns="http://wsaa.view.sua.dvadac.desein.afip.gov"><loginCmsReturn>${escaped}</loginCmsReturn></loginCmsResponse></soapenv:Body></soapenv:Envelope>`;
    const ticket = parseLoginResponse(xml);
    expect(ticket.token).toBe('TOK');
    expect(ticket.sign).toBe('SIG');
    expect(ticket.expirationTime.toISOString()).toBe('2026-11-17T03:00:00.000Z');
  });

  it('propaga el fault de WSAA', () => {
    const fault =
      '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><soapenv:Fault><faultcode>ns1:cms.cert.untrusted</faultcode><faultstring>Certificado no emitido por AC de confianza</faultstring></soapenv:Fault></soapenv:Body></soapenv:Envelope>';
    expect(() => parseLoginResponse(fault)).toThrow('Certificado no emitido por AC de confianza');
  });

  it('oculta token, sign y CMS en los logs', () => {
    const redacted = redactSecrets(
      '<ar:Auth><ar:Token>SECRET</ar:Token><ar:Sign>SIGNSECRET</ar:Sign></ar:Auth><wsaa:in0>CMSDATA</wsaa:in0>&lt;token&gt;T&lt;/token&gt;',
    );
    expect(redacted).not.toMatch(/SECRET|CMSDATA|&lt;token&gt;T&lt;/);
  });
});
