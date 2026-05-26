import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import supertest from 'supertest';
import nock from 'nock';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { randomUUID } from 'crypto';

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

// ---- constants ----

const TEST_API_KEY =
  process.env.API_KEY ??
  (() => {
    throw new Error('API_KEY not set');
  })();
const TEST_EMAIL = 'test@example.com';
const TEST_REPO = 'facebook/react';

// ---- helpers ----

function mockGithubSuccess(repo: string, tag: string) {
  const [owner, name] = repo.split('/');

  nock('https://api.github.com')
    .post('/graphql')
    .reply(200, {
      data: {
        repo0: {
          nameWithOwner: `${owner}/${name}`,
          latestRelease: { tagName: tag },
        },
      },
    });
}

function mockGithubNotFound() {
  nock('https://api.github.com')
    .post('/graphql')
    .reply(200, {
      data: { repo0: null },
      errors: [{ type: 'NOT_FOUND', message: 'Could not resolve to a Repository' }],
    });
}

async function createPendingSubscription(
  prisma: PrismaClient,
  overrides: Partial<{
    email: string;
    repository: string;
    confirmToken: string;
    unsubscribeToken: string;
  }> = {},
) {
  return prisma.subscription.create({
    data: {
      email: TEST_EMAIL,
      repository: TEST_REPO,
      status: 'PENDING',
      confirmToken: randomUUID(),
      unsubscribeToken: randomUUID(),
      ...overrides,
    },
  });
}

async function createActiveSubscription(
  prisma: PrismaClient,
  overrides: Partial<{
    email: string;
    repository: string;
    confirmToken: string;
    unsubscribeToken: string;
  }> = {},
) {
  return prisma.subscription.create({
    data: {
      email: TEST_EMAIL,
      repository: TEST_REPO,
      status: 'ACTIVE',
      confirmToken: randomUUID(),
      unsubscribeToken: randomUUID(),
      ...overrides,
    },
  });
}

// ---- setup ----

describe('Subscription REST API', () => {
  let app: FastifyInstance;
  let client: ReturnType<typeof supertest>;
  let prisma: PrismaClient;
  let redis: Redis;

  beforeAll(async () => {
    const prismaModule = await import('../../lib/prisma');
    prisma = prismaModule.prisma;
    await prisma.$connect();

    const redisModule = await import('../../lib/redis/redis');
    redis = redisModule.redis;

    const { buildApp } = await import('../../app');
    app = await buildApp();
    await app.ready();

    client = supertest(app.server);
  }, 60_000);

  afterAll(async () => {
    nock.cleanAll();
    await app?.close();
    await prisma.$disconnect();
    await redis.quit();
  });

  beforeEach(async () => {
    await prisma.subscription.deleteMany();
    await redis.flushdb();
    nock.cleanAll();
  });

  // ---- POST /api/subscribe ----

  describe('POST /api/subscribe', () => {
    it('повертає 201 і створює підписку зі статусом PENDING', async () => {
      mockGithubSuccess(TEST_REPO, 'v18.0.0');

      const response = await client
        .post('/api/subscribe')
        .send({ email: TEST_EMAIL, repo: TEST_REPO });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('success');
      expect(nock.isDone()).toBe(true);

      const sub = await prisma.subscription.findFirst({
        where: { email: TEST_EMAIL, repository: TEST_REPO },
      });
      expect(sub).not.toBeNull();
      expect(sub?.status).toBe('PENDING');
      expect(sub?.confirmToken).toBeDefined();
      expect(sub?.unsubscribeToken).toBeDefined();
    });

    it('повертає 409 і не створює дублікат якщо активна підписка вже існує', async () => {
      await createActiveSubscription(prisma);
      mockGithubSuccess(TEST_REPO, 'v18.0.0');

      const response = await client
        .post('/api/subscribe')
        .send({ email: TEST_EMAIL, repo: TEST_REPO });

      expect(response.status).toBe(409);

      const count = await prisma.subscription.count();
      expect(count).toBe(1);
    });

    it('повертає 201 якщо підписка вже існує зі статусом PENDING', async () => {
      await createPendingSubscription(prisma);
      mockGithubSuccess(TEST_REPO, 'v18.0.0');

      const response = await client
        .post('/api/subscribe')
        .send({ email: TEST_EMAIL, repo: TEST_REPO });

      expect(response.status).toBe(201);
      expect(nock.isDone()).toBe(true);

      const count = await prisma.subscription.count();
      expect(count).toBe(1);
    });

    it('повертає 400 якщо формат репозиторію невалідний', async () => {
      const response = await client
        .post('/api/subscribe')
        .send({ email: TEST_EMAIL, repo: 'invalid-repo-without-slash' });

      expect(response.status).toBe(400);
    });

    it('повертає 400 якщо email невалідний', async () => {
      const response = await client
        .post('/api/subscribe')
        .send({ email: 'not-an-email', repo: TEST_REPO });

      expect(response.status).toBe(400);
    });

    it('повертає 404 і не створює підписку якщо репозиторій не існує на GitHub', async () => {
      mockGithubNotFound();

      const response = await client
        .post('/api/subscribe')
        .send({ email: TEST_EMAIL, repo: 'nobody/does-not-exist-123' });

      expect(response.status).toBe(404);
      expect(nock.isDone()).toBe(true);

      const count = await prisma.subscription.count({
        where: { repository: 'nobody/does-not-exist-123' },
      });
      expect(count).toBe(0);
    });
  });

  // ---- GET /api/confirm/:token ----

  describe('GET /api/confirm/:token', () => {
    it('активує підписку і повертає HTML сторінку', async () => {
      const sub = await createPendingSubscription(prisma);

      const response = await client.get(`/api/confirm/${sub.confirmToken}`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');

      const updated = await prisma.subscription.findUnique({ where: { id: sub.id } });
      expect(updated?.status).toBe('ACTIVE');
    });

    it('повертає 404 якщо токен не існує', async () => {
      const response = await client.get('/api/confirm/invalid-token-xyz');

      expect(response.status).toBe(404);
    });

    it('не змінює статус інших підписок', async () => {
      const sub1 = await createPendingSubscription(prisma, {
        email: 'user1@example.com',
        confirmToken: 'token-1',
        unsubscribeToken: 'unsub-1',
      });
      await createPendingSubscription(prisma, {
        email: 'user2@example.com',
        confirmToken: 'token-2',
        unsubscribeToken: 'unsub-2',
      });

      await client.get(`/api/confirm/${sub1.confirmToken}`);

      const untouched = await prisma.subscription.findFirst({
        where: { email: 'user2@example.com' },
      });
      expect(untouched?.status).toBe('PENDING');
    });
  });

  // ---- GET /api/unsubscribe/:token ----

  describe('GET /api/unsubscribe/:token', () => {
    it('видаляє підписку і повертає HTML сторінку', async () => {
      const sub = await createActiveSubscription(prisma);

      const response = await client.get(`/api/unsubscribe/${sub.unsubscribeToken}`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');

      const deleted = await prisma.subscription.findUnique({ where: { id: sub.id } });
      expect(deleted).toBeNull();
    });

    it('повертає 404 якщо токен не існує', async () => {
      const response = await client.get('/api/unsubscribe/invalid-token-xyz');

      expect(response.status).toBe(404);
    });

    it('не видаляє інші підписки', async () => {
      const sub1 = await createActiveSubscription(prisma, {
        email: 'user1@example.com',
        unsubscribeToken: 'unsub-token-1',
        confirmToken: 'confirm-1',
      });
      await createActiveSubscription(prisma, {
        email: 'user2@example.com',
        unsubscribeToken: 'unsub-token-2',
        confirmToken: 'confirm-2',
      });

      await client.get(`/api/unsubscribe/${sub1.unsubscribeToken}`);

      const remaining = await prisma.subscription.findFirst({
        where: { email: 'user2@example.com' },
      });
      expect(remaining).not.toBeNull();
    });
  });

  // ---- GET /api/subscriptions ----

  describe('GET /api/subscriptions', () => {
    it('повертає список підписок для email', async () => {
      await createActiveSubscription(prisma);

      const response = await client
        .get(`/api/subscriptions?email=${TEST_EMAIL}`)
        .set('x-api-key', TEST_API_KEY);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.subscriptions).toHaveLength(1);
      expect(response.body.subscriptions[0].status).toBe('ACTIVE');
      expect(response.body.subscriptions[0].repository).toBe(TEST_REPO);
      expect(response.body.email).toBe(TEST_EMAIL);
    });

    it('повертає порожній масив якщо підписок немає', async () => {
      const response = await client
        .get(`/api/subscriptions?email=${TEST_EMAIL}`)
        .set('x-api-key', TEST_API_KEY);

      expect(response.status).toBe(200);
      expect(response.body.subscriptions).toHaveLength(0);
    });

    it('повертає 401 якщо API key відсутній', async () => {
      const response = await client.get(`/api/subscriptions?email=${TEST_EMAIL}`);

      expect(response.status).toBe(401);
    });

    it('повертає 401 якщо API key невалідний', async () => {
      const response = await client
        .get(`/api/subscriptions?email=${TEST_EMAIL}`)
        .set('x-api-key', 'wrong-key');

      expect(response.status).toBe(401);
    });

    it('повертає 400 якщо email не переданий', async () => {
      const response = await client.get('/api/subscriptions').set('x-api-key', TEST_API_KEY);

      expect(response.status).toBe(400);
    });
  });
});
