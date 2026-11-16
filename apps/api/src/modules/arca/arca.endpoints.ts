import { ArcaEnvironment } from '@prisma/client';

/**
 * Endpoints oficiales de los web services de ARCA.
 * Fuente: https://www.arca.gob.ar/ws/documentacion/ws-factura-electronica.asp
 * Homologación y producción están completamente separados (URLs, certificados y tickets).
 */
export const ARCA_ENDPOINTS: Record<ArcaEnvironment, { wsaa: string; wsfe: string }> = {
  HOMOLOGATION: {
    wsaa: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
    wsfe: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
  },
  PRODUCTION: {
    wsaa: 'https://wsaa.afip.gov.ar/ws/services/LoginCms',
    wsfe: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
  },
};

export const WSFE_NAMESPACE = 'http://ar.gov.afip.dif.FEV1/';
export const WSFE_SERVICE_NAME = 'wsfe';
