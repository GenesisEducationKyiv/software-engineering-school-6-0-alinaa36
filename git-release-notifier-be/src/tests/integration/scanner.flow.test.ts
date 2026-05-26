import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import nock from 'nock';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { config } from '../../lib/config/env.config';
import { RedisCacheRepository } from '../../modules/common/cache/cache.repository';
import { GithubHttpClient } from '../../modules/github/client/github.client';
import { GithubQueryBuilder } from '../../modules/github/query/github-query.builder';
import { GithubResponseParser } from '../../modules/github/query/github-response.parser';
import { GithubService } from '../../modules/github/services/github.service';
import { ScanBatchProcessor } from '../../workers/scanner/scanner.processor';
import {
  GithubReleaseAdapter,
  PrismaSubscriptionAdapter,
} from '../../workers/scanner/adapters/scanner.adapters';
import type { INotifier } from '../../workers/scanner/interfaces/scanner.interfaces';
import type Redis from 'ioredis';
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

const TEST_REPO = 'facebook/react';
const TEST_EMAIL = 'scanner-test@example.com';
const OLD_TAG = 'v17.0.0';
const NEW_TAG = 'v18.2.0';

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

function mockGithubNoRelease(repo: string) {
  nock('https://api.github.com')
    .post('/graphql')
    .reply(200, {
      data: {
        repo0: {
          nameWithOwner: repo,
          latestRelease: null,
        },
      },
    });
}

function makeNotifier(): INotifier {
  return {
    sendReleaseNotification: vi.fn().mockResolvedValue(undefined),
  } satisfies INotifier;
}

function makeProcessor(notifier: INotifier) {
  const githubService = new GithubService(
    new GithubHttpClient(() => ({
      Authorization: `Bearer ${config.github.token}`,
      'Content-Type': 'application/json',
    })),
    new RedisCacheRepository(),
    new GithubQueryBuilder(),
    new GithubResponseParser(),
  );

  return new ScanBatchProcessor({
    provider: new GithubReleaseAdapter(githubService),
    repository: new PrismaSubscriptionAdapter(),
    notifier,
  });
}

async function createActiveSubscription(
  prisma: PrismaClient,
  overrides: Partial<{
    email: string;
    repository: string;
    lastSeenTag: string | null;
    confirmToken: string;
    unsubscribeToken: string;
  }> = {},
) {
  return prisma.subscription.create({
    data: {
      email: TEST_EMAIL,
      repository: TEST_REPO,
      status: 'ACTIVE',
      lastSeenTag: OLD_TAG,
      confirmToken: randomUUID(),
      unsubscribeToken: randomUUID(),
      ...overrides,
    },
  });
}

// ---- setup ----

describe('ScanBatchProcessor integration', () => {
  let app: FastifyInstance;
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

  // --- happy path ---

  describe('новий реліз для підписника з застарілим тегом', () => {
    it('надсилає нотифікацію підписнику', async () => {
      const sub = await createActiveSubscription(prisma, { unsubscribeToken: 'unsub-tok-1' });
      mockGithubRelease(TEST_REPO, NEW_TAG);

      const notifier = makeNotifier();
      await makeProcessor(notifier).process([TEST_REPO]);

      expect(notifier.sendReleaseNotification).toHaveBeenCalledWith({
        email: TEST_EMAIL,
        repo: TEST_REPO,
        tag: NEW_TAG,
        unsubscribeToken: sub.unsubscribeToken,
      });
      expect(nock.isDone()).toBe(true);
    });

    it('оновлює lastSeenTag в БД', async () => {
      const sub = await createActiveSubscription(prisma);
      mockGithubRelease(TEST_REPO, NEW_TAG);

      await makeProcessor(makeNotifier()).process([TEST_REPO]);

      const updated = await prisma.subscription.findUnique({ where: { id: sub.id } });
      expect(updated?.lastSeenTag).toBe(NEW_TAG);
    });
  });

  // --- підписник вже бачив тег ---

  describe('підписник вже має актуальний тег', () => {
    it('не надсилає нотифікацію', async () => {
      await createActiveSubscription(prisma, { lastSeenTag: NEW_TAG });
      mockGithubRelease(TEST_REPO, NEW_TAG);

      const notifier = makeNotifier();
      await makeProcessor(notifier).process([TEST_REPO]);

      expect(notifier.sendReleaseNotification).not.toHaveBeenCalled();
      expect(nock.isDone()).toBe(true);
    });

    it('не оновлює lastSeenTag в БД', async () => {
      const sub = await createActiveSubscription(prisma, { lastSeenTag: NEW_TAG });
      mockGithubRelease(TEST_REPO, NEW_TAG);

      await makeProcessor(makeNotifier()).process([TEST_REPO]);

      const unchanged = await prisma.subscription.findUnique({ where: { id: sub.id } });
      expect(unchanged?.lastSeenTag).toBe(NEW_TAG);
    });
  });

  // --- перший реліз (lastSeenTag === null) ---

  describe('підписник ще не бачив жодного релізу', () => {
    it('надсилає нотифікацію про перший реліз', async () => {
      const sub = await createActiveSubscription(prisma, {
        lastSeenTag: null,
        unsubscribeToken: 'unsub-tok-first',
        confirmToken: 'confirm-tok-first',
      });
      mockGithubRelease(TEST_REPO, NEW_TAG);

      const notifier = makeNotifier();
      await makeProcessor(notifier).process([TEST_REPO]);

      expect(notifier.sendReleaseNotification).toHaveBeenCalledWith({
        email: TEST_EMAIL,
        repo: TEST_REPO,
        tag: NEW_TAG,
        unsubscribeToken: sub.unsubscribeToken,
      });
      expect(nock.isDone()).toBe(true);
    });

    it('оновлює lastSeenTag після першого релізу', async () => {
      const sub = await createActiveSubscription(prisma, {
        lastSeenTag: null,
        confirmToken: 'confirm-tok-first-2',
        unsubscribeToken: 'unsub-tok-first-2',
      });
      mockGithubRelease(TEST_REPO, NEW_TAG);

      await makeProcessor(makeNotifier()).process([TEST_REPO]);

      const updated = await prisma.subscription.findUnique({ where: { id: sub.id } });
      expect(updated?.lastSeenTag).toBe(NEW_TAG);
    });
  });

  // --- репозиторій без релізів ---

  describe('репозиторій без релізів', () => {
    it('не надсилає нотифікацію', async () => {
      await createActiveSubscription(prisma);
      mockGithubNoRelease(TEST_REPO);

      const notifier = makeNotifier();
      await makeProcessor(notifier).process([TEST_REPO]);

      expect(notifier.sendReleaseNotification).not.toHaveBeenCalled();
      expect(nock.isDone()).toBe(true);
    });

    it('не оновлює lastSeenTag в БД', async () => {
      const sub = await createActiveSubscription(prisma);
      mockGithubNoRelease(TEST_REPO);

      await makeProcessor(makeNotifier()).process([TEST_REPO]);

      const unchanged = await prisma.subscription.findUnique({ where: { id: sub.id } });
      expect(unchanged?.lastSeenTag).toBe(OLD_TAG);
    });
  });

  // --- кілька підписників ---

  describe('кілька підписників на один репозиторій', () => {
    it('надсилає нотифікацію кожному підписнику', async () => {
      await createActiveSubscription(prisma, {
        email: 'user1@example.com',
        confirmToken: 'confirm-1',
        unsubscribeToken: 'unsub-1',
      });
      await createActiveSubscription(prisma, {
        email: 'user2@example.com',
        confirmToken: 'confirm-2',
        unsubscribeToken: 'unsub-2',
      });
      mockGithubRelease(TEST_REPO, NEW_TAG);

      const notifier = makeNotifier();
      await makeProcessor(notifier).process([TEST_REPO]);

      expect(notifier.sendReleaseNotification).toHaveBeenCalledTimes(2);
      expect(nock.isDone()).toBe(true);
    });

    it('оновлює lastSeenTag для всіх підписників', async () => {
      const sub1 = await createActiveSubscription(prisma, {
        email: 'user1@example.com',
        confirmToken: 'confirm-1',
        unsubscribeToken: 'unsub-1',
      });
      const sub2 = await createActiveSubscription(prisma, {
        email: 'user2@example.com',
        confirmToken: 'confirm-2',
        unsubscribeToken: 'unsub-2',
      });
      mockGithubRelease(TEST_REPO, NEW_TAG);

      await makeProcessor(makeNotifier()).process([TEST_REPO]);

      const updated1 = await prisma.subscription.findUnique({ where: { id: sub1.id } });
      const updated2 = await prisma.subscription.findUnique({ where: { id: sub2.id } });
      expect(updated1?.lastSeenTag).toBe(NEW_TAG);
      expect(updated2?.lastSeenTag).toBe(NEW_TAG);
    });
  });
});
