import * as forge from 'node-forge';

/**
 * Funciones criptográficas para WSAA: armado del TRA (Ticket de Requerimiento de Acceso),
 * firma CMS/PKCS#7 con el certificado y clave privada del contribuyente, y validación de
 * certificados emitidos por ARCA.
 */

/** OID 2.5.4.5 (serialNumber del subject X.500), donde ARCA ubica "CUIT nnnnnnnnnnn". */
const SERIAL_NUMBER_OID = '2.5.4.5';

/** Formato ISO 8601 con offset de Argentina (-03:00) requerido por WSAA. */
export function toArcaDateTime(date: Date): string {
  const shifted = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  return `${shifted.toISOString().slice(0, 19)}-03:00`;
}

export function buildTra(service: string, now: Date = new Date()): string {
  const generation = new Date(now.getTime() - 10 * 60 * 1000);
  const expiration = new Date(now.getTime() + 10 * 60 * 1000);
  const uniqueId = Math.floor(now.getTime() / 1000);
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<loginTicketRequest version="1.0">' +
    '<header>' +
    `<uniqueId>${uniqueId}</uniqueId>` +
    `<generationTime>${toArcaDateTime(generation)}</generationTime>` +
    `<expirationTime>${toArcaDateTime(expiration)}</expirationTime>` +
    '</header>' +
    `<service>${service}</service>` +
    '</loginTicketRequest>'
  );
}

/** Firma el TRA como CMS SignedData con contenido incluido (attached), SHA-256. Devuelve base64. */
export function signTra(tra: string, certificatePem: string, privateKeyPem: string): string {
  const cert = forge.pki.certificateFromPem(certificatePem);
  const key = forge.pki.privateKeyFromPem(privateKeyPem);
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(tra, 'utf8');
  p7.addCertificate(cert);
  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() as unknown as string },
    ],
  });
  p7.sign();
  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  return forge.util.encode64(der);
}

export interface CertificateInfo {
  subject: string;
  serialNumber: string;
  cuit: string | null;
  validFrom: Date;
  validTo: Date;
}

export function inspectCertificate(certificatePem: string): CertificateInfo {
  let cert: forge.pki.Certificate;
  try {
    cert = forge.pki.certificateFromPem(certificatePem);
  } catch {
    throw new Error('El certificado no tiene formato PEM X.509 válido');
  }
  const subject = cert.subject.attributes.map((a) => `${a.shortName ?? a.name}=${a.value}`).join(', ');
  // ARCA incluye la CUIT en el atributo serialNumber del subject: "CUIT 20123456789".
  const serialAttr = cert.subject.getField({ type: SERIAL_NUMBER_OID });
  const match = /(\d{11})/.exec(String(serialAttr?.value ?? subject));
  return {
    subject,
    serialNumber: cert.serialNumber,
    cuit: match ? match[1] : null,
    validFrom: cert.validity.notBefore,
    validTo: cert.validity.notAfter,
  };
}

/** Verifica que la clave privada corresponda a la clave pública del certificado. */
export function keyMatchesCertificate(certificatePem: string, privateKeyPem: string): boolean {
  try {
    const cert = forge.pki.certificateFromPem(certificatePem);
    const key = forge.pki.privateKeyFromPem(privateKeyPem) as forge.pki.rsa.PrivateKey;
    const pub = cert.publicKey as forge.pki.rsa.PublicKey;
    return pub.n.equals(key.n) && pub.e.equals(key.e);
  } catch {
    return false;
  }
}

/** Genera clave RSA 2048 y CSR con el formato que exige ARCA para obtener el certificado. */
export function generateKeyAndCsr(params: { cuit: string; organization: string; alias: string }) {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = keys.publicKey;
  csr.setSubject([
    { name: 'countryName', value: 'AR' },
    { name: 'organizationName', value: params.organization },
    { name: 'commonName', value: params.alias },
    { type: SERIAL_NUMBER_OID, value: `CUIT ${params.cuit}` },
  ]);
  csr.sign(keys.privateKey, forge.md.sha256.create());
  return {
    privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
    csrPem: forge.pki.certificationRequestToPem(csr),
  };
}

export interface LoginTicket {
  token: string;
  sign: string;
  generationTime: Date;
  expirationTime: Date;
}
