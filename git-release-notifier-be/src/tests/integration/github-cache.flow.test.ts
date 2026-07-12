import { FastifyInstance } from 'fastify';
import nock from 'nock';
import supertest from 'supertest';
import { vi, describe, beforeAll, afterAll, it, expect } from 'vitest';

vi.mock('../../../lib/rabbit/rabbit.connection', () => ({
  getRabbitConnection: vi.fn().mockResolvedValue({
    createChannel: vi.fn().mockResolvedValue({
      assertQueue: vi.fn(),
      sendToQueue: vi.fn(),
      close: vi.fn(),
    }),
  }),
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn().mockReturnValue({
      sendMail: vi.fn().mockResolvedValue({ messageId: 'test-id' }),
    }),
    getTestMessageUrl: vi.fn().mockReturnValue('http://test-url'),
  },
}));

describe('Redis Cache Integration (Вимога 2)', () => {
  let app: FastifyInstance;

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

  it('повинен робити запит до GitHub лише 1 раз, а другий брати з кешу', async () => {
    const client = supertest(app.server);
    const targetRepo = 'nestjs/nest';

    const { prisma } = await import('../../lib/prisma');
    await prisma.subscription.deleteMany();

    const { redis } = await import('../../lib/redis/redis');
    await redis.flushall();

    const githubScope = nock('https://api.github.com')
      .post('/graphql')
      .times(1)
      .reply(200, {
        data: {
          repo0: {
            nameWithOwner: targetRepo,
            latestRelease: { tagName: 'v10.0.0' },
          },
        },
      });

    const res1 = await client
      .post('/api/subscribe')
      .send({ email: 'user1@test.com', repo: targetRepo });

    expect(res1.status).toBe(201);

    expect(githubScope.isDone()).toBe(true);

    const res2 = await client
      .post('/api/subscribe')
      .send({ email: 'user2@test.com', repo: targetRepo });

    expect(res2.status).toBe(201);
  });
});
