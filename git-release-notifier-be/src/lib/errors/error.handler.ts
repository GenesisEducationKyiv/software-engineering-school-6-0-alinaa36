import type { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from './app.error';

export function errorHandler(
  error: FastifyError | AppError | ZodError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      status: 'error',
      message: error.message,
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

  request.log.error({ err: error });

  const isDev = process.env.NODE_ENV === 'development';

  return reply.status(500).send({
    status: 'error',
    message: isDev ? error.message : 'Internal server error',
    ...(isDev && {
      errorName: error.name,
      stack: error.stack,
    }),
  });
}
