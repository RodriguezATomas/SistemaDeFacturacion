/**
 * Verificación de conectividad REAL con ARCA (sin credenciales):
 * - FEDummy de WSFEv1 en homologación (y producción con --production).
 * - Handshake TLS con WSAA.
 * Uso: npm run arca:check -w apps/api [-- --production]
 */
import { ARCA_ENDPOINTS } from '../src/modules/arca/arca.endpoints';
import { soapPost } from '../src/modules/arca/soap/soap-transport';
import { buildDummyRequest, parseDummy } from '../src/modules/arca/wsfe/wsfe-xml';

async function check(env: 'HOMOLOGATION' | 'PRODUCTION') {
  const ciphers = process.env.ARCA_TLS_CIPHERS ?? 'DEFAULT@SECLEVEL=1';
  const res = await soapPost(ARCA_ENDPOINTS[env].wsfe, buildDummyRequest(), 'http://ar.gov.afip.dif.FEV1/FEDummy', {
    timeoutMs: 30000,
    ciphers,
  });
  console.warn(`[${env}] WSFEv1 FEDummy (HTTP ${res.status}, ${res.durationMs} ms):`, parseDummy(res.body));

  const wsaa = await soapPost(ARCA_ENDPOINTS[env].wsaa.replace('/LoginCms', '/LoginCms?wsdl'), '', '', {
    timeoutMs: 30000,
    ciphers,
  }).catch((e: Error) => ({ status: 0, body: e.message, durationMs: 0 }));
  console.warn(`[${env}] WSAA alcanzable: HTTP ${wsaa.status}`);
}

(async () => {
  await check('HOMOLOGATION');
  if (process.argv.includes('--production')) await check('PRODUCTION');
})().catch((e) => {
  console.error('Fallo de conectividad con ARCA:', (e as Error).message);
  process.exit(1);
});
