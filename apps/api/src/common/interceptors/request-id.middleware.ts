import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

/** Asigna un identificador a cada request para correlacionar logs y respuestas de error. */
export function requestIdMiddleware(
  req: Request & { id?: string },
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.headers['x-request-id'];
  req.id = typeof incoming === 'string' && /^[\w-]{1,64}$/.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}
