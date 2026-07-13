import { type FastifyRequest } from 'fastify';
import { AppError, UnauthorizedError } from '../../../lib/errors/app.error';
import { Logger } from '../../../lib/logger/logger';
import { config } from '../../../lib/config/env.config';

export const verifyApiKey = async (request: FastifyRequest): Promise<void> => {
  const apiKey = request.headers['x-api-key'];
  const validKey = config.api.key;

  if (!validKey) {
    Logger.error('[Auth] Error: API_KEY is not configured in .env');
    throw new AppError('Internal Server Error: API_KEY missing', 500);
  }

  if (!apiKey || apiKey !== validKey) {
    const providedKey = Array.isArray(apiKey) ? apiKey[0] : apiKey;
    Logger.warn(`[Auth] Access denied. Provided key: ${providedKey || 'missing'}`);
    throw new UnauthorizedError('Invalid or missing x-api-key in headers');
  }
};
