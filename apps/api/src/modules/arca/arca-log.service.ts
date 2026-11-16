import { Injectable, Logger } from '@nestjs/common';
import { ArcaEnvironment, Prisma } from '@prisma/client';
import { paginate, PaginationQueryDto, skipTake } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';

export interface ArcaCallContext {
  companyId: string;
  environment: ArcaEnvironment;
  invoiceId?: string;
}

export interface ArcaLogEntry extends ArcaCallContext {
  service: string;
  operation: string;
  requestXml: string;
  responseXml?: string;
  httpStatus?: number;
  success: boolean;
  errorMessage?: string;
  durationMs: number;
}

/** Oculta token, sign y CMS en los registros: los XML se guardan para trazabilidad sin credenciales. */
export function redactSecrets(xml: string): string {
  return xml
    .replace(/(<(?:\w+:)?Token>)[\s\S]*?(<\/(?:\w+:)?Token>)/g, '$1***$2')
    .replace(/(<(?:\w+:)?Sign>)[\s\S]*?(<\/(?:\w+:)?Sign>)/g, '$1***$2')
    .replace(/(<(?:\w+:)?in0>)[\s\S]*?(<\/(?:\w+:)?in0>)/g, '$1[CMS firmado omitido]$2')
    .replace(/(&lt;token&gt;)[\s\S]*?(&lt;\/token&gt;)/g, '$1***$2')
    .replace(/(&lt;sign&gt;)[\s\S]*?(&lt;\/sign&gt;)/g, '$1***$2')
    .replace(/(<token>)[\s\S]*?(<\/token>)/g, '$1***$2')
    .replace(/(<sign>)[\s\S]*?(<\/sign>)/g, '$1***$2');
}

@Injectable()
export class ArcaLogService {
  private readonly logger = new Logger(ArcaLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: ArcaLogEntry): Promise<void> {
    try {
      await this.prisma.arcaRequestLog.create({
        data: {
          companyId: entry.companyId,
          environment: entry.environment,
          service: entry.service,
          operation: entry.operation,
          invoiceId: entry.invoiceId,
          requestXml: redactSecrets(entry.requestXml),
          responseXml: entry.responseXml ? redactSecrets(entry.responseXml) : null,
          httpStatus: entry.httpStatus,
          success: entry.success,
          errorMessage: entry.errorMessage?.slice(0, 2000),
          durationMs: entry.durationMs,
        },
      });
    } catch (err) {
      this.logger.error(`No se pudo registrar la operación ARCA ${entry.operation}`, err as Error);
    }
  }

  async list(companyId: string, q: PaginationQueryDto & { invoiceId?: string; operation?: string }) {
    const where: Prisma.ArcaRequestLogWhereInput = {
      companyId,
      ...(q.invoiceId ? { invoiceId: q.invoiceId } : {}),
      ...(q.operation ? { operation: q.operation } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.arcaRequestLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...skipTake(q),
      }),
      this.prisma.arcaRequestLog.count({ where }),
    ]);
    return paginate(data, total, q);
  }
}
