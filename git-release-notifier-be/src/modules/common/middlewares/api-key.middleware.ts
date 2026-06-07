import { type FastifyRequest } from 'fastify';
import { AppError, ErrorCode, UnauthorizedError } from '../../../lib/errors/app.error';
import { Logger } from '../../../lib/logger/logger';
import { config } from '../../../lib/config/env.config';

export const verifyApiKey = async (request: FastifyRequest): Promise<void> => {
  const apiKey = request.headers['x-api-key'];
  const validKey = config.api.key;

  if (!validKey) {
    Logger.error('[Auth] Error: API_KEY is not configured in .env');
    throw new AppError(ErrorCode.INTERNAL, 500, { isOperational: false });
  }

  if (!apiKey || apiKey !== validKey) {
    Logger.warn('[Auth] Access denied: invalid or missing x-api-key.');
    throw new UnauthorizedError(ErrorCode.UNAUTHORIZED);
  }
};
