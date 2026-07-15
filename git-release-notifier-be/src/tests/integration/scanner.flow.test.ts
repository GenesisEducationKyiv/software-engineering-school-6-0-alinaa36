import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import nock from 'nock';
import type { App } from '../../app';
import type { PrismaClient } from '@prisma/client';
import { config } from '../../lib/config/env.config';
import { RedisCacheRepository } from '../../modules/common/cache/cache.repository';
import { REDIS_CACHE_TTL_SECONDS } from '../../modules/common/constants/api.constants';
import { GithubClient } from '../../modules/github/client/github.client';
import { CachedGithubClient } from '../../modules/github/decorators/cached-github.decorator';
import { ScanBatchProcessor } from '../../workers/scanner/scanner.processor';
import { GithubReleaseAdapter } from '../../workers/scanner/infrastructure/adapters/github-release-source-provider.adapter';
import { SubscriptionRepository } from '../../modules/subscriptions/repositories/subscription.repository';
import type { INotifier } from '../../workers/scanner/interfaces/scanner.interfaces';
import type Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { prisma } from '../../lib/prisma';

vi.mock('../../../../lib/rabbit/rabbit.connection', () => ({
  getRabbitConnection: vi.fn().mockResolvedValue({
    createChannel: vi.fn().mockResolvedValue({
      assertQueue: vi.fn(),
      sendToQueue: vi.fn(),
      close: vi.fn(),
    }),
  }),
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

function makeProcessor(notifier: INotifier, redis: Redis) {
  const githubClient = new CachedGithubClient(
    new GithubClient(config.github.token),
    new RedisCacheRepository(redis),
    REDIS_CACHE_TTL_SECONDS,
  );

  return new ScanBatchProcessor({
    provider: new GithubReleaseAdapter(githubClient),
    repository: new SubscriptionRepository(prisma),
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
  let app: App;
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
      await makeProcessor(notifier, redis).process([TEST_REPO]);

      expect(notifier.sendReleaseNotification).toHaveBeenCalledWith({
        email: TEST_EMAIL,
        repo: TEST_REPO,
        tag: NEW_TAG,
        unsubscribeToken: sub.unsubscribeToken,
      });
      expect(nock.isDone()).toBe(true);
    });

    it('НЕ зсуває lastSeenTag (зсув — відповідальність delivered-consumer після доставки)', async () => {
      const sub = await createActiveSubscription(prisma);
      mockGithubRelease(TEST_REPO, NEW_TAG);

      await makeProcessor(makeNotifier(), redis).process([TEST_REPO]);

      const updated = await prisma.subscription.findUnique({ where: { id: sub.id } });
      expect(updated?.lastSeenTag).toBe(OLD_TAG);
    });
  });

  // --- підписник вже бачив тег ---

  describe('підписник вже має актуальний тег', () => {
    it('не надсилає нотифікацію', async () => {
      await createActiveSubscription(prisma, { lastSeenTag: NEW_TAG });
      mockGithubRelease(TEST_REPO, NEW_TAG);

      const notifier = makeNotifier();
      await makeProcessor(notifier, redis).process([TEST_REPO]);

      expect(notifier.sendReleaseNotification).not.toHaveBeenCalled();
      expect(nock.isDone()).toBe(true);
    });

    it('не оновлює lastSeenTag в БД', async () => {
      const sub = await createActiveSubscription(prisma, { lastSeenTag: NEW_TAG });
      mockGithubRelease(TEST_REPO, NEW_TAG);

      await makeProcessor(makeNotifier(), redis).process([TEST_REPO]);

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
      await makeProcessor(notifier, redis).process([TEST_REPO]);

      expect(notifier.sendReleaseNotification).toHaveBeenCalledWith({
        email: TEST_EMAIL,
        repo: TEST_REPO,
        tag: NEW_TAG,
        unsubscribeToken: sub.unsubscribeToken,
      });
      expect(nock.isDone()).toBe(true);
    });

    it('НЕ зсуває lastSeenTag після першого релізу (зсув — після доставки)', async () => {
      const sub = await createActiveSubscription(prisma, {
        lastSeenTag: null,
        confirmToken: 'confirm-tok-first-2',
        unsubscribeToken: 'unsub-tok-first-2',
      });
      mockGithubRelease(TEST_REPO, NEW_TAG);

      await makeProcessor(makeNotifier(), redis).process([TEST_REPO]);

      const updated = await prisma.subscription.findUnique({ where: { id: sub.id } });
      expect(updated?.lastSeenTag).toBeNull();
    });
  });

  // --- репозиторій без релізів ---

  describe('репозиторій без релізів', () => {
    it('не надсилає нотифікацію', async () => {
      await createActiveSubscription(prisma);
      mockGithubNoRelease(TEST_REPO);

      const notifier = makeNotifier();
      await makeProcessor(notifier, redis).process([TEST_REPO]);

      expect(notifier.sendReleaseNotification).not.toHaveBeenCalled();
      expect(nock.isDone()).toBe(true);
    });

    it('не оновлює lastSeenTag в БД', async () => {
      const sub = await createActiveSubscription(prisma);
      mockGithubNoRelease(TEST_REPO);

      await makeProcessor(makeNotifier(), redis).process([TEST_REPO]);

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
      await makeProcessor(notifier, redis).process([TEST_REPO]);

      expect(notifier.sendReleaseNotification).toHaveBeenCalledTimes(2);
      expect(nock.isDone()).toBe(true);
    });

    it('НЕ зсуває lastSeenTag підписників (зсув — після доставки)', async () => {
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

      await makeProcessor(makeNotifier(), redis).process([TEST_REPO]);

      const updated1 = await prisma.subscription.findUnique({ where: { id: sub1.id } });
      const updated2 = await prisma.subscription.findUnique({ where: { id: sub2.id } });
      expect(updated1?.lastSeenTag).toBe(OLD_TAG);
      expect(updated2?.lastSeenTag).toBe(OLD_TAG);
    });
  });

  // --- зсув тегу після підтвердження доставки (delivered-event) ---

  describe('advanceTag — зсув тегу по факту доставки', () => {
    it('зсуває lastSeenTag для (email, repo)', async () => {
      const sub = await createActiveSubscription(prisma);
      const repository = new SubscriptionRepository(prisma);

      await repository.advanceTag(TEST_EMAIL, TEST_REPO, NEW_TAG);

      const updated = await prisma.subscription.findUnique({ where: { id: sub.id } });
      expect(updated?.lastSeenTag).toBe(NEW_TAG);
    });

    it('повторний виклик ідемпотентний (тег лишається тим самим)', async () => {
      const sub = await createActiveSubscription(prisma);
      const repository = new SubscriptionRepository(prisma);

      await repository.advanceTag(TEST_EMAIL, TEST_REPO, NEW_TAG);
      await repository.advanceTag(TEST_EMAIL, TEST_REPO, NEW_TAG);

      const updated = await prisma.subscription.findUnique({ where: { id: sub.id } });
      expect(updated?.lastSeenTag).toBe(NEW_TAG);
    });
  });
});
