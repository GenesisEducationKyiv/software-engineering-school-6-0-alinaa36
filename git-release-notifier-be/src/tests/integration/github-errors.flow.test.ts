import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import supertest from 'supertest';
import nock from 'nock';
import type { FastifyInstance } from 'fastify';

vi.mock('../../../lib/rabbit/rabbit.connection', () => ({
  getRabbitConnection: vi.fn().mockResolvedValue({
    createChannel: vi.fn().mockResolvedValue({
      assertQueue: vi.fn(),
      sendToQueue: vi.fn(),
      close: vi.fn(),
    }),
  }),
}));

vi.mock('../../../modules/sender/services/mail.service', () => ({
  notifierService: { sendConfirmationEmail: vi.fn().mockResolvedValue(undefined) },
}));

describe('Rate Limiting & GitHub Errors (Вимога 7)', () => {
  let app: FastifyInstance;
  const TEST_API_KEY = process.env.API_KEY || 'super-secret-alina-key-2026';

  beforeAll(async () => {
    const { prisma } = await import('../../lib/prisma');
    await prisma.$connect();

    const { buildApp } = await import('../../app');
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    nock.cleanAll();
    await app?.close();
    const { prisma } = await import('../../lib/prisma');
    await prisma.$disconnect();
  });

  it('не повинен падати (500), якщо GitHub повертає помилку ліміту (403)', async () => {
    const client = supertest(app.server);
    const targetRepo = 'angular/angular';

    const { prisma } = await import('../../lib/prisma');
    await prisma.subscription.deleteMany();

    nock('https://api.github.com').post('/graphql').reply(403, {
      message: 'API rate limit exceeded for your IP address.',
    });

    const res = await client
      .post('/api/subscriptions/subscribe')
      .set('x-api-key', TEST_API_KEY)
      .send({ email: 'alina-test@test.com', repository: targetRepo });

    expect(res.status).not.toBe(500);

    expect(res.status).toBeGreaterThanOrEqual(400);

    const count = await prisma.subscription.count({ where: { repository: targetRepo } });
    expect(count).toBe(0);
  });
});
