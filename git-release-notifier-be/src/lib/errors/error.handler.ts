import type { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from './app.error';
import { ERROR_MESSAGES } from './error-messages';
import { Logger } from '../logger/logger';

export function errorHandler(
  error: FastifyError | AppError | ZodError | Error,
  _request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  if (error instanceof AppError) {
    if (!error.isOperational || error.statusCode >= 500) {
      Logger.error({ err: error }, `[Error] ${error.code}`);
    }

    return reply.status(error.statusCode).send({
      status: 'error',
      code: error.code,
      message: ERROR_MESSAGES[error.code],
    });
  }

  if (error instanceof ZodError) {
    return reply.status(400).send({
      status: 'error',
      message: 'Validation failed',
      details: error.issues.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
  }

  Logger.error({ err: error }, '[Error] Unhandled');

  const isDev = process.env.NODE_ENV === 'development';

  return reply.status(500).send({
    status: 'error',
    code: 'INTERNAL',
    message: isDev ? error.message : 'Internal server error',
    ...(isDev && {
      errorName: error.name,
      stack: error.stack,
    }),
  });
}
