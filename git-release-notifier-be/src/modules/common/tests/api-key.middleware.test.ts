import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/config/env.config', () => ({
  config: { api: { key: 'valid-api-key' } },
}));

vi.mock('../../../lib/logger/logger', () => ({
  Logger: { warn: vi.fn(), error: vi.fn() },
}));

import { UnauthorizedError } from '../../../lib/errors/app.error';
import { verifyApiKey } from '../middlewares/api-key.middleware';
import type { FastifyRequest } from 'fastify';

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
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  // --- масив ключів ---

  it('кидає UnauthorizedError якщо передано масив з неправильним ключем', async () => {
    await expect(verifyApiKey(makeRequest(['wrong-key']))).rejects.toThrow(UnauthorizedError);
  });
});
