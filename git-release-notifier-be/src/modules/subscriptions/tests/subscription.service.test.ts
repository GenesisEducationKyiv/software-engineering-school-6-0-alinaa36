import type { Mocked } from 'vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/metrics/metrics', () => ({
  activeSubscriptionsGauge: { set: vi.fn() },
}));

import { SubscriptionService } from '../services/subscription.service';
import { activeSubscriptionsGauge } from '../../../lib/metrics/metrics';
import { NotFoundError, ConflictError } from '../../../lib/errors/app.error';
import type { GithubService } from '../../github/services/github.service';
import type { NotifierService } from '../../sender/services/mail.service';
import type {
  ISubscriptionRepository,
  RepositoryGroup,
  SubscriptionSummary,
} from '../interfaces/subscription-repository.interface';
import type { Subscription } from '@prisma/client';

// ---- helpers ----

function makeRepository(): Mocked<ISubscriptionRepository> {
  return {
    upsertPending: vi.fn<(email: string, repository: string) => Promise<Subscription>>(),
    findByConfirmToken: vi.fn<(token: string) => Promise<Subscription | null>>(),
    findByUnsubscribeToken: vi.fn<(token: string) => Promise<Subscription | null>>(),
    activate: vi.fn<(id: string) => Promise<Subscription>>(),
    delete: vi.fn<(id: string) => Promise<Subscription>>(),
    findByEmail: vi.fn<(email: string) => Promise<SubscriptionSummary[]>>(),
    groupByRepository: vi.fn<() => Promise<RepositoryGroup[]>>(),
    countActive: vi.fn<() => Promise<number>>(),
    checkIfActiveExists: vi.fn<(email: string, repository: string) => Promise<boolean>>(),
  };
}

function makeSubscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: '1',
    email: 'user@example.com',
    repository: 'user/repo',
    lastSeenTag: null,
    status: 'PENDING',
    confirmToken: 'confirm-tok',
    unsubscribeToken: 'unsub-tok',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function mockGithubService(): Mocked<GithubService> {
  return {
    getLatestReleasesBatch: vi.fn<(repos: string[]) => Promise<Record<string, string | null>>>(),
  } as unknown as Mocked<GithubService>;
}

function mockNotifierService(): Mocked<NotifierService> {
  return {
    sendConfirmationEmail: vi
      .fn<(email: string, repoFullName: string, token: string) => Promise<void>>()
      .mockResolvedValue(undefined),
    sendReleaseNotification: vi
      .fn<
        (
          email: string,
          repoFullName: string,
          tagName: string,
          unsubscribeToken: string,
        ) => Promise<void>
      >()
      .mockResolvedValue(undefined),
  } as unknown as Mocked<NotifierService>;
}

describe('SubscriptionService', () => {
  let repository: Mocked<ISubscriptionRepository>;
  let mockedGithubService: Mocked<GithubService>;
  let mockedNotifierService: Mocked<NotifierService>;
  let service: SubscriptionService;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = makeRepository();
    mockedGithubService = mockGithubService();
    mockedNotifierService = mockNotifierService();
    service = new SubscriptionService(repository, mockedGithubService, mockedNotifierService);
  });

  describe('subscribeToRepo', () => {
    beforeEach(() => {
      mockedGithubService.getLatestReleasesBatch.mockResolvedValue({
        'user/repo': 'v1.0.0',
      });
      repository.checkIfActiveExists.mockResolvedValue(false);
    });

    it('викликає GitHub сервіс з правильним репозиторієм', async () => {
      repository.upsertPending.mockResolvedValue(makeSubscription());

      await service.subscribeToRepo('user@example.com', 'user/repo');

      expect(mockedGithubService.getLatestReleasesBatch).toHaveBeenCalledWith(['user/repo']);
    });

    it('зберігає підписку в базі даних', async () => {
      repository.upsertPending.mockResolvedValue(makeSubscription());

      await service.subscribeToRepo('user@example.com', 'user/repo');

      expect(repository.upsertPending).toHaveBeenCalledWith('user@example.com', 'user/repo');
    });

    it('надсилає confirmation email з токеном', async () => {
      repository.upsertPending.mockResolvedValue(makeSubscription({ confirmToken: 'confirm-tok' }));

      await service.subscribeToRepo('user@example.com', 'user/repo');

      expect(mockedNotifierService.sendConfirmationEmail).toHaveBeenCalledWith(
        'user@example.com',
        'user/repo',
        'confirm-tok',
      );
    });

    it('повертає створену підписку', async () => {
      const subscription = makeSubscription();
      repository.upsertPending.mockResolvedValue(subscription);

      const result = await service.subscribeToRepo('user@example.com', 'user/repo');

      expect(result).toEqual(subscription);
    });

    it('кидає ConflictError якщо активна підписка вже існує', async () => {
      repository.checkIfActiveExists.mockResolvedValue(true);

      await expect(service.subscribeToRepo('user@example.com', 'user/repo')).rejects.toThrow(
        ConflictError,
      );
    });

    it('не зберігає підписку якщо активна вже існує', async () => {
      repository.checkIfActiveExists.mockResolvedValue(true);

      await expect(service.subscribeToRepo('user@example.com', 'user/repo')).rejects.toThrow(
        ConflictError,
      );

      expect(repository.upsertPending).not.toHaveBeenCalled();
    });

    it('кидає NotFoundError якщо репозиторій не знайдено на GitHub', async () => {
      mockedGithubService.getLatestReleasesBatch.mockResolvedValue({});

      await expect(
        service.subscribeToRepo('user@example.com', 'user/invalid-repo'),
      ).rejects.toThrow(NotFoundError);
    });

    it('не зберігає підписку якщо репозиторій не знайдено на GitHub', async () => {
      mockedGithubService.getLatestReleasesBatch.mockResolvedValue({});

      await expect(
        service.subscribeToRepo('user@example.com', 'user/invalid-repo'),
      ).rejects.toThrow(NotFoundError);

      expect(repository.upsertPending).not.toHaveBeenCalled();
    });

    it('пробрасовує помилку якщо база даних кинула виняток', async () => {
      repository.upsertPending.mockRejectedValue(new Error('DB error'));

      await expect(service.subscribeToRepo('user@example.com', 'user/repo')).rejects.toThrow(
        'DB error',
      );
    });
  });

  describe('confirmSubscription', () => {
    it('кидає NotFoundError якщо токен не знайдено', async () => {
      const invalidToken = 'invalid-token';
      repository.findByConfirmToken.mockResolvedValue(null);

      await expect(service.confirmSubscription(invalidToken)).rejects.toThrow(NotFoundError);
    });

    it('активує підписку за коректним id', async () => {
      repository.findByConfirmToken.mockResolvedValue(makeSubscription({ id: '42' }));
      repository.activate.mockResolvedValue(makeSubscription({ id: '42', status: 'ACTIVE' }));
      repository.countActive.mockResolvedValue(5);

      await service.confirmSubscription('valid-token');

      expect(repository.activate).toHaveBeenCalledWith('42');
    });

    it('оновлює gauge після активації', async () => {
      repository.findByConfirmToken.mockResolvedValue(makeSubscription({ id: '1' }));
      repository.activate.mockResolvedValue(makeSubscription({ id: '1', status: 'ACTIVE' }));
      repository.countActive.mockResolvedValue(7);

      await service.confirmSubscription('valid-token');

      expect(activeSubscriptionsGauge.set).toHaveBeenCalledWith(7);
    });

    it('повертає активовану підписку', async () => {
      const activatedSubscription = makeSubscription({ id: '1', status: 'ACTIVE' });
      repository.findByConfirmToken.mockResolvedValue(makeSubscription({ id: '1' }));
      repository.activate.mockResolvedValue(activatedSubscription);
      repository.countActive.mockResolvedValue(1);

      const result = await service.confirmSubscription('valid-token');

      expect(result).toEqual(activatedSubscription);
    });
  });

  describe('unsubscribeFromRepo', () => {
    it('кидає NotFoundError якщо токен не знайдено', async () => {
      const invalidToken = 'invalid-token';
      repository.findByUnsubscribeToken.mockResolvedValue(null);

      await expect(service.unsubscribeFromRepo(invalidToken)).rejects.toThrow(NotFoundError);
    });

    it('видаляє підписку за id', async () => {
      repository.findByUnsubscribeToken.mockResolvedValue(makeSubscription({ id: '99' }));
      repository.delete.mockResolvedValue(makeSubscription({ id: '99' }));
      repository.countActive.mockResolvedValue(3);

      await service.unsubscribeFromRepo('valid-token');

      expect(repository.delete).toHaveBeenCalledWith('99');
    });

    it('оновлює gauge після видалення', async () => {
      repository.findByUnsubscribeToken.mockResolvedValue(makeSubscription({ id: '1' }));
      repository.delete.mockResolvedValue(makeSubscription({ id: '1' }));
      repository.countActive.mockResolvedValue(2);

      await service.unsubscribeFromRepo('valid-token');

      expect(activeSubscriptionsGauge.set).toHaveBeenCalledWith(2);
    });

    it('повертає видалену підписку', async () => {
      const deletedSubscription = makeSubscription({ id: '1', repository: 'user/repo' });
      repository.findByUnsubscribeToken.mockResolvedValue(makeSubscription({ id: '1' }));
      repository.delete.mockResolvedValue(deletedSubscription);
      repository.countActive.mockResolvedValue(0);

      const result = await service.unsubscribeFromRepo('valid-token');

      expect(result).toEqual(deletedSubscription);
    });
  });

  describe('getSubscriptionsByEmail', () => {
    it('повертає підписки для email', async () => {
      const userSubscriptions: SubscriptionSummary[] = [
        {
          repository: 'user/repo',
          status: 'ACTIVE',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ];
      repository.findByEmail.mockResolvedValue(userSubscriptions);

      const result = await service.getSubscriptionsByEmail('user@example.com');

      expect(result).toEqual(userSubscriptions);
    });

    it('викликає repository.findByEmail з правильним email', async () => {
      const userEmail = 'user@example.com';
      repository.findByEmail.mockResolvedValue([]);

      await service.getSubscriptionsByEmail(userEmail);

      expect(repository.findByEmail).toHaveBeenCalledWith(userEmail);
    });

    it('повертає порожній масив якщо підписок немає', async () => {
      repository.findByEmail.mockResolvedValue([]);

      const result = await service.getSubscriptionsByEmail('unknown@example.com');

      expect(result).toEqual([]);
    });
  });

  describe('groupByRepository', () => {
    it('повертає список унікальних репозиторіїв', async () => {
      const repos: RepositoryGroup[] = [
        { repository: 'user/repo-a', count: 2 },
        { repository: 'user/repo-b', count: 1 },
      ];
      repository.groupByRepository.mockResolvedValue(repos);

      const result = await service.groupByRepository();

      expect(result).toEqual(repos);
    });

    it('повертає порожній масив якщо підписок немає', async () => {
      repository.groupByRepository.mockResolvedValue([]);

      const result = await service.groupByRepository();

      expect(result).toEqual([]);
    });
  });
});
