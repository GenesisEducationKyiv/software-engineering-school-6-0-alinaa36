import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import supertest from 'supertest';
import nock from 'nock';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';

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

const TEST_EMAIL = 'test@example.com';
const TEST_REPO = 'angular/angular';

// ---- helpers ----

function mockGithubRateLimit() {
  nock('https://api.github.com')
    .post('/graphql')
    .reply(403, { message: 'API rate limit exceeded for your IP address.' });
}

function mockGithubServerError() {
  nock('https://api.github.com').post('/graphql').reply(500, { message: 'Internal Server Error' });
}

function mockGithubNetworkError() {
  nock('https://api.github.com').post('/graphql').replyWithError('Connection refused');
}

function mockGithubEmptyResponse() {
  nock('https://api.github.com').post('/graphql').reply(200, {});
}

// ---- scenarios ----

type ErrorScenario = {
  name: string;
  mock: () => void;
  minStatus: number;
  maxStatus: number;
};

const errorScenarios: ErrorScenario[] = [
  {
    name: 'rate limit (403)',
    mock: mockGithubRateLimit,
    minStatus: 400,
    maxStatus: 499,
  },
  {
    name: 'server error (500)',
    mock: mockGithubServerError,
    minStatus: 400,
    maxStatus: 599,
  },
  {
    name: 'network error',
    mock: mockGithubNetworkError,
    minStatus: 400,
    maxStatus: 599,
  },
  {
    name: 'empty response',
    mock: mockGithubEmptyResponse,
    minStatus: 400,
    maxStatus: 599,
  },
];

// ---- setup ----

describe('GitHub Errors handling', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let client: ReturnType<typeof supertest>;

  beforeAll(async () => {
    const prismaModule = await import('../../lib/prisma');
    prisma = prismaModule.prisma;
    await prisma.$connect();

    const { buildApp } = await import('../../app');
    app = await buildApp();
    await app.ready();

    client = supertest(app.server);
  }, 60_000);

  afterAll(async () => {
    nock.cleanAll();
    await app?.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.subscription.deleteMany();
    nock.cleanAll();
  });

  it.each(errorScenarios)(
    '$name — повертає помилку і не створює підписку',
    async ({ mock, minStatus, maxStatus }) => {
      mock();

      const response = await client
        .post('/api/subscribe')
        .send({ email: TEST_EMAIL, repo: TEST_REPO });

      expect(response.status).toBeGreaterThanOrEqual(minStatus);
      expect(response.status).toBeLessThanOrEqual(maxStatus);
      expect(nock.isDone()).toBe(true);

      const count = await prisma.subscription.count({
        where: { repository: TEST_REPO },
      });
      expect(count).toBe(0);
    },
  );
});
