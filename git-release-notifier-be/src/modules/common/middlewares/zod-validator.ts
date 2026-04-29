import { FastifyRequest, FastifyReply } from 'fastify';
import { ZodTypeAny } from 'zod';

export const validateBodyZod = (schema: ZodTypeAny) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const result = schema.safeParse(request.body);

    if (!result.success) {
      const firstIssue = result.error.issues[0];

      return reply.status(400).send({
        status: 'error',
        message: firstIssue?.message || 'Помилка валідації',
        failedField: firstIssue?.path.join('.') || 'body',
      });
    }
    request.body = result.data;
  };
};
