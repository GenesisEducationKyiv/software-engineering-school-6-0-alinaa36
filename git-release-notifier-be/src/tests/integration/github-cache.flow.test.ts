import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import supertest from 'supertest';
import nock from 'nock';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { REDIS_CACHE_TTL_SECONDS } from '../../modules/common/constants/api.constants';

vi.mock('../../lib/rabbit/rabbit.connection', () => ({
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

const TEST_REPO = 'nestjs/nest';
const TEST_TAG = 'v10.0.0';
const CACHE_KEY_PATTERN = 'cache:github:releases:*';

// ---- helpers ----

function mockGithubRelease(repo: string, tag: string) {
  nock('https://api.github.com')
    .post('/graphql')
    .reply(200, {
      data: {
        repo0: {
          nameWithOwner: repo,
          latestRelease: { tagName: tag },
        },
      },
    });
}

// ---- setup ----

describe('Redis Cache integration', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let redis: Redis;
  let client: ReturnType<typeof supertest>;

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

  // --- cache miss ---

  describe('cache miss', () => {
    it('робить запит до GitHub якщо кешу немає', async () => {
      const githubScope = nock('https://api.github.com')
        .post('/graphql')
        .times(1)
        .reply(200, {
          data: {
            repo0: {
              nameWithOwner: TEST_REPO,
              latestRelease: { tagName: TEST_TAG },
            },
          },
        });

      await client.post('/api/subscribe').send({ email: 'user@example.com', repo: TEST_REPO });

      expect(githubScope.isDone()).toBe(true);
    });

    it('зберігає результат у Redis після запиту до GitHub', async () => {
      mockGithubRelease(TEST_REPO, TEST_TAG);

      await client.post('/api/subscribe').send({ email: 'user@example.com', repo: TEST_REPO });

      const keys = await redis.keys(CACHE_KEY_PATTERN);
      expect(keys).toHaveLength(1);
    });

    it('зберігає результат з правильним TTL', async () => {
      mockGithubRelease(TEST_REPO, TEST_TAG);

      await client.post('/api/subscribe').send({ email: 'user@example.com', repo: TEST_REPO });

      const keys = await redis.keys(CACHE_KEY_PATTERN);
      const ttl = await redis.ttl(keys[0]);

      expect(ttl).toBeGreaterThan(REDIS_CACHE_TTL_SECONDS - 5);
      expect(ttl).toBeLessThanOrEqual(REDIS_CACHE_TTL_SECONDS);
    });
  });

  // --- cache hit ---

  describe('cache hit', () => {
    beforeEach(async () => {
      mockGithubRelease(TEST_REPO, TEST_TAG);

      await client.post('/api/subscribe').send({ email: 'user1@example.com', repo: TEST_REPO });

      await prisma.subscription.deleteMany();
    });

    it('не робить запит до GitHub якщо дані є в кеші', async () => {
      const response = await client
        .post('/api/subscribe')
        .send({ email: 'user2@example.com', repo: TEST_REPO });

      expect(response.status).toBe(201);
    });
  });

  // --- після очищення кешу ---

  describe('після очищення кешу', () => {
    beforeEach(async () => {
      mockGithubRelease(TEST_REPO, TEST_TAG);

      await client.post('/api/subscribe').send({ email: 'user1@example.com', repo: TEST_REPO });

      await prisma.subscription.deleteMany();
      await redis.flushdb();
    });

    it('робить новий запит до GitHub після очищення кешу', async () => {
      const githubScope = nock('https://api.github.com')
        .post('/graphql')
        .times(1)
        .reply(200, {
          data: {
            repo0: {
              nameWithOwner: TEST_REPO,
              latestRelease: { tagName: TEST_TAG },
            },
          },
        });

      await client.post('/api/subscribe').send({ email: 'user2@example.com', repo: TEST_REPO });

      expect(githubScope.isDone()).toBe(true);
    });

    it('зберігає новий результат в кеш після повторного запиту', async () => {
      mockGithubRelease(TEST_REPO, 'v11.0.0');

      await client.post('/api/subscribe').send({ email: 'user2@example.com', repo: TEST_REPO });

      const keys = await redis.keys(CACHE_KEY_PATTERN);
      expect(keys).toHaveLength(1);
    });
  });
});
