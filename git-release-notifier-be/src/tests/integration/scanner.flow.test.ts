import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import nock from 'nock';
import type { FastifyInstance } from 'fastify';
import { config } from '../../lib/config/env.config';
import { RedisCacheRepository } from '../../modules/common/cache/cache.repository';
import { GithubHttpClient } from '../../modules/github/client/github.client';
import { GithubQueryBuilder } from '../../modules/github/query/github-query.builder';
import { GithubResponseParser } from '../../modules/github/query/github-response.parser';
import { GithubService } from '../../modules/github/services/github.service';

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

describe('Scanner Pipeline (Вимога 3)', () => {
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

  it('повинен виявити нову версію, оновити БД та викликати нотифікатор', async () => {
    const { prisma } = await import('../../lib/prisma');
    const targetRepo = 'facebook/react';

    await prisma.subscription.deleteMany();

    await prisma.subscription.create({
      data: {
        email: 'alina-scanner@test.com',
        repository: targetRepo,
        status: 'ACTIVE',
        lastSeenTag: 'v17.0.0',
        confirmToken: 'scanner-token-1',
        unsubscribeToken: 'unsub-token-unique-123',
      },
    });

    nock('https://api.github.com')
      .post('/graphql')
      .reply(200, {
        data: {
          repo0: {
            nameWithOwner: targetRepo,
            latestRelease: { tagName: 'v18.2.0' },
          },
        },
      });

    const { ScanBatchProcessor } = await import('../../workers/scanner/scanner.processor');
    const { GithubReleaseAdapter, PrismaSubscriptionAdapter } =
      await import('../../workers/scanner/adapters/scanner.adapters');

    const mockNotifier = {
      sendReleaseNotification: vi.fn().mockResolvedValue(undefined),
    };

    const processor = new ScanBatchProcessor({
      provider: new GithubReleaseAdapter(
        new GithubService(
          new GithubHttpClient(() => ({
            Authorization: `Bearer ${config.github.token}`,
            'Content-Type': 'application/json',
          })),
          new RedisCacheRepository(),
          new GithubQueryBuilder(),
          new GithubResponseParser(),
        ),
      ),
      repository: new PrismaSubscriptionAdapter(),
      notifier: mockNotifier,
    });

    await processor.process([targetRepo]);

    const updatedSub = await prisma.subscription.findFirst({
      where: { email: 'alina-scanner@test.com' },
    });
    expect(updatedSub?.lastSeenTag).toBe('v18.2.0');

    expect(mockNotifier.sendReleaseNotification).toHaveBeenCalledWith(
      'alina-scanner@test.com',
      targetRepo,
      'v18.2.0',
      'unsub-token-unique-123',
    );
  });
});
