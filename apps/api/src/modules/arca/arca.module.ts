import { Module } from '@nestjs/common';
import { ArcaController } from './arca.controller';
import { ArcaLogService } from './arca-log.service';
import { ArcaStatusService } from './arca-status.service';
import { CredentialsService } from './credentials.service';
import { WsaaService } from './wsaa/wsaa.service';
import { WsfeService } from './wsfe/wsfe.service';

/**
 * Integración fiscal con ARCA. Separada por servicio (WSAA, WSFEv1) para incorporar
 * otros web services (p. ej. WSFEX para exportación) sin modificar los existentes.
 */
@Module({
  controllers: [ArcaController],
  providers: [ArcaLogService, CredentialsService, WsaaService, WsfeService, ArcaStatusService],
  exports: [WsfeService, ArcaStatusService, ArcaLogService],
})
export class ArcaModule {}
