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
import { FastifyRequest } from 'fastify/types/request';

// ---- helpers ----

function makeRequest(apiKey?: string | string[]) {
  return {
    headers: {
      'x-api-key': apiKey,
    },
  } as unknown as FastifyRequest; // ✅ Головна зміна тут
}
// ---- тести ----

describe('verifyApiKey', () => {
  beforeEach(() => vi.clearAllMocks());

  // --- успішна авторизація ---

  it('не кидає помилку якщо ключ коректний', async () => {
    await expect(verifyApiKey(makeRequest('valid-api-key'))).resolves.not.toThrow();
  });

  // --- відсутній або неправильний ключ ---

  it('кидає UnauthorizedError якщо ключ не передано', async () => {
    await expect(verifyApiKey(makeRequest())).rejects.toThrow(UnauthorizedError);
  });

  it('кидає UnauthorizedError якщо ключ неправильний', async () => {
    await expect(verifyApiKey(makeRequest('wrong-key'))).rejects.toThrow(UnauthorizedError);
  });

  it('кидає UnauthorizedError якщо передано порожній рядок', async () => {
    await expect(verifyApiKey(makeRequest(''))).rejects.toThrow(UnauthorizedError);
  });

  it('логує попередження при невдалій авторизації з ключем', async () => {
    await verifyApiKey(makeRequest('wrong-key')).catch(() => {});

    expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('wrong-key'));
  });

  it('логує "missing" якщо ключ не передано', async () => {
    await verifyApiKey(makeRequest()).catch(() => {});

    expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('missing'));
  });

  // --- масив ключів ---

  it('кидає UnauthorizedError якщо передано масив з неправильним ключем', async () => {
    await expect(verifyApiKey(makeRequest(['wrong-key']))).rejects.toThrow(UnauthorizedError);
  });

  it('логує перший елемент масиву при невдалій авторизації', async () => {
    await verifyApiKey(makeRequest(['bad-key', 'other-key'])).catch(() => {});

    expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('bad-key'));
  });
});
