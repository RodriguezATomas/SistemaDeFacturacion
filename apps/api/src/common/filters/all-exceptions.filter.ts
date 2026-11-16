import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string;
  details?: unknown;
  path: string;
  requestId?: string;
  timestamp: string;
}

/**
 * Manejo centralizado de errores: todas las respuestas de error tienen la misma forma
 * (ver docs/API.md). Los errores no controlados se registran y se devuelven sin detalles internos.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();

    const { status, message, details } = this.resolve(exception);

    if (status >= 500) {
      this.logger.error(
        `${req.method} ${req.originalUrl} -> ${status} [${req.id ?? '-'}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ApiErrorBody = {
      statusCode: status,
      error: HttpStatus[status] ?? 'ERROR',
      message,
      details,
      path: req.originalUrl,
      requestId: req.id,
      timestamp: new Date().toISOString(),
    };
    res.status(status).json(body);
  }

  private resolve(exception: unknown): { status: number; message: string; details?: unknown } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'string') return { status, message: response };
      const r = response as { message?: string | string[]; details?: unknown };
      if (Array.isArray(r.message)) {
        return { status, message: 'Datos de entrada inválidos', details: r.message };
      }
      return { status, message: r.message ?? exception.message, details: r.details };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          return {
            status: HttpStatus.CONFLICT,
            message: 'Ya existe un registro con esos datos',
            details: { fields: exception.meta?.target },
          };
        case 'P2025':
          return { status: HttpStatus.NOT_FOUND, message: 'Registro no encontrado' };
        case 'P2003':
          return {
            status: HttpStatus.CONFLICT,
            message: 'La operación viola una relación existente entre registros',
          };
      }
    }

    return { status: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Error interno del servidor' };
  }
}
