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

vi.mock('../../../lib/redis/redis', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
  },
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn().mockReturnValue({
      sendMail: vi.fn().mockResolvedValue({ messageId: 'test-id' }),
    }),
    getTestMessageUrl: vi.fn().mockReturnValue('http://test-url'),
  },
}));

describe('subscription flow (Existing Docker Dev DB)', () => {
  let app: FastifyInstance;
  const TEST_API_KEY = process.env.API_KEY || 'super-secret-alina-key-2026';

  beforeAll(async () => {
    const { prisma } = await import('../../lib/prisma');
    await prisma.$connect();

    const { buildApp } = await import('../../app');
    app = await buildApp();
    await app.ready();
  }, 60000);

  afterAll(async () => {
    nock.cleanAll();
    await app?.close();
    const { prisma } = await import('../../lib/prisma');
    await prisma.$disconnect();
  });

  it('повний цикл: subscribe -> confirm -> unsubscribe', async () => {
    const client = supertest(app.server);

    const { prisma } = await import('../../lib/prisma');
    await prisma.subscription.deleteMany();

    nock('https://api.github.com')
      .post('/graphql')
      .reply(200, {
        data: {
          repo0: {
            nameWithOwner: 'facebook/react',
            latestRelease: { tagName: 'v18.2.0' },
          },
        },
      });

    const subscribeRes = await client
      .post('/api/subscribe')
      .send({ email: 'alina-test@example.com', repo: 'facebook/react' });

    expect(subscribeRes.status).toBe(201);

    const confirmToken = (subscribeRes.body as { _test_token?: string })._test_token;
    expect(confirmToken).toBeDefined();

    const confirmRes = await client.get(`/api/confirm/${confirmToken}`);
    expect(confirmRes.status).toBe(200);

    const subsRes = await client
      .get('/api/subscriptions?email=alina-test@example.com')
      .set('x-api-key', TEST_API_KEY);

    expect((subsRes.body as { subscriptions: unknown[] }).subscriptions).toHaveLength(1);
    expect((subsRes.body as { subscriptions: { status: string }[] }).subscriptions[0].status).toBe(
      'ACTIVE',
    );

    const subInDb = await prisma.subscription.findFirst({
      where: { email: 'alina-test@example.com', repository: 'facebook/react' },
    });

    expect(subInDb?.unsubscribeToken).toBeDefined();

    const unsubToken = subInDb!.unsubscribeToken;
    const unsubRes = await client.get(`/api/unsubscribe/${unsubToken}`);

    expect(unsubRes.status).toBe(200);

    const finalRes = await client
      .get('/api/subscriptions?email=alina-test@example.com')
      .set('x-api-key', TEST_API_KEY);

    expect(finalRes.status).toBe(200);
    const finalSubscriptions = (finalRes.body as { subscriptions: unknown[] }).subscriptions;
    expect(finalSubscriptions).toHaveLength(0);
  });

  describe('GitHub Validation (Вимога 6)', () => {
    it('має повертати 400 для невалідного формату репозиторію', async () => {
      const client = supertest(app.server);
      const res = await client
        .post('/api/subscribe')
        .send({ email: 'test@test.com', repo: 'invalid-name-without-slash' });

      expect(res.status).toBe(400);
    });

    it('має повертати 404, якщо репозиторій не існує на GitHub', async () => {
      const client = supertest(app.server);

      nock('https://api.github.com')
        .post('/graphql')
        .reply(200, {
          data: { repo0: null },
          errors: [{ type: 'NOT_FOUND', message: 'Could not resolve to a Repository' }],
        });

      const res = await client
        .post('/api/subscribe')
        .send({ email: 'test@test.com', repo: 'nobody/does-not-exist-123' });

      expect(res.status).toBe(404);

      const { prisma } = await import('../../lib/prisma');
      const count = await prisma.subscription.count({
        where: { repository: 'nobody/does-not-exist-123' },
      });
      expect(count).toBe(0);
    });
  });
});
