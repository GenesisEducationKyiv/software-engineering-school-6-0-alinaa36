/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/config/env.config', () => ({
  config: { api: { key: 'valid-api-key' } },
}));

vi.mock('../../../lib/logger/logger', () => ({
  Logger: { warn: vi.fn(), error: vi.fn() },
}));

import { UnauthorizedError } from '../../../lib/errors/app.error';
import { Logger } from '../../../lib/logger/logger';
import { verifyApiKey } from '../middlewares/api-key.middleware';
import { FastifyRequest } from 'fastify';

// ---- helpers ----

function makeRequest(apiKey?: string | string[]) {
  return {
    headers: {
      'x-api-key': apiKey,
    },
  } as unknown as FastifyRequest;
}
// ---- тести ----

describe('verifyApiKey', () => {
  beforeEach(() => vi.clearAllMocks());

  // --- успішна авторизація ---

  it('не кидає помилку якщо ключ коректний', async () => {
    expect(() => verifyApiKey(makeRequest('valid-api-key'))).not.toThrow();
  });

  // --- відсутній або неправильний ключ ---

  it('кидає UnauthorizedError якщо ключ не передано', async () => {
    expect(() => verifyApiKey(makeRequest())).toThrow(UnauthorizedError);
  });

  it('кидає UnauthorizedError якщо ключ неправильний', async () => {
    expect(() => verifyApiKey(makeRequest('wrong-key'))).toThrow(UnauthorizedError);
  });

  it('кидає UnauthorizedError якщо передано порожній рядок', async () => {
    expect(() => verifyApiKey(makeRequest(''))).toThrow(UnauthorizedError);
  });

  it('логує попередження при невдалій авторизації з ключем', async () => {
    expect(() => verifyApiKey(makeRequest('wrong-key'))).toThrow(UnauthorizedError);

    expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('wrong-key'));
  });

  it('логує "missing" якщо ключ не передано', () => {
    expect(() => verifyApiKey(makeRequest())).toThrow(UnauthorizedError);

    expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('missing'));
  });

  // --- масив ключів ---

  it('кидає UnauthorizedError якщо передано масив з неправильним ключем', async () => {
    expect(() => verifyApiKey(makeRequest(['wrong-key']))).toThrow(UnauthorizedError);
  });

  it('логує перший елемент масиву при невдалій авторизації', () => {
    expect(() => verifyApiKey(makeRequest(['bad-key', 'other-key']))).toThrow(UnauthorizedError);

    expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('bad-key'));
  });
});
