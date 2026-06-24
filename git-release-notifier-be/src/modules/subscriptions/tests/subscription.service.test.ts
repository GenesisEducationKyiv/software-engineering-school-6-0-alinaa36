import type { Mocked } from 'vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/logger/logger', () => ({
  Logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { SubscriptionService } from '../services/subscription.service';
import { NotFoundError, ConflictError } from '../../../lib/errors/app.error';
import type {
  ISubscriptionRepository,
  SubscriptionEntity,
  SubscriptionSummary,
  RepositoryGroup,
} from '../interfaces/subscription-repository.interface';
import type { IRepositoryProvider } from '../interfaces/release-provider.interface';
import type { ISubscribeSaga } from '../../saga/interfaces/subscribe-saga.interface';

// ---- helpers ----

function makeRepository(): Mocked<ISubscriptionRepository> {
  return {
    upsertPending: vi.fn(),
    findByConfirmToken: vi.fn(),
    findByUnsubscribeToken: vi.fn(),
    activate: vi.fn(),
    delete: vi.fn(),
    findByEmail: vi.fn(),
    groupByRepository: vi.fn(),
    countActive: vi.fn(),
    checkIfActiveExists: vi.fn(),
  };
}

function makeRepoProvider(): Mocked<IRepositoryProvider> {
  return {
    exists: vi.fn().mockResolvedValue(true),
  };
}

function makeSubscribeSaga(): Mocked<ISubscribeSaga> {
  return {
    start: vi.fn(),
  };
}

function makeSubscription(overrides: Partial<SubscriptionEntity> = {}): SubscriptionEntity {
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

function makeService() {
  const repository = makeRepository();
  const repoProvider = makeRepoProvider();
  const subscribeSaga = makeSubscribeSaga();
  const service = new SubscriptionService(repository, repoProvider, subscribeSaga);

  return { service, repository, repoProvider, subscribeSaga };
}

// ---- тести ----

describe('SubscriptionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('subscribeToRepo', () => {
    it('перевіряє існування репозиторію на GitHub', async () => {
      const { service, repository, repoProvider, subscribeSaga } = makeService();
      repository.checkIfActiveExists.mockResolvedValue(false);
      subscribeSaga.start.mockResolvedValue(makeSubscription());

      await service.subscribeToRepo('user@example.com', 'user/repo');

      expect(repoProvider.exists).toHaveBeenCalledWith('user/repo');
    });

    it('делегує запуск саги з email та репозиторієм', async () => {
      const { service, repository, subscribeSaga } = makeService();
      repository.checkIfActiveExists.mockResolvedValue(false);
      subscribeSaga.start.mockResolvedValue(makeSubscription());

      await service.subscribeToRepo('user@example.com', 'user/repo');

      expect(subscribeSaga.start).toHaveBeenCalledWith('user@example.com', 'user/repo');
    });

    it('повертає підписку, створену сагою', async () => {
      const { service, repository, subscribeSaga } = makeService();
      const subscription = makeSubscription();
      repository.checkIfActiveExists.mockResolvedValue(false);
      subscribeSaga.start.mockResolvedValue(subscription);

      const result = await service.subscribeToRepo('user@example.com', 'user/repo');

      expect(result).toEqual(subscription);
    });

    it('кидає ConflictError якщо активна підписка вже існує', async () => {
      const { service, repository } = makeService();
      repository.checkIfActiveExists.mockResolvedValue(true);

      await expect(service.subscribeToRepo('user@example.com', 'user/repo')).rejects.toThrow(
        ConflictError,
      );
    });

    it('не запускає сагу якщо активна підписка вже існує', async () => {
      const { service, repository, subscribeSaga } = makeService();
      repository.checkIfActiveExists.mockResolvedValue(true);

      await service.subscribeToRepo('user@example.com', 'user/repo').catch(() => {});

      expect(subscribeSaga.start).not.toHaveBeenCalled();
    });

    it('кидає NotFoundError якщо репозиторій не знайдено на GitHub', async () => {
      const { service, repository, repoProvider } = makeService();
      repository.checkIfActiveExists.mockResolvedValue(false);
      repoProvider.exists.mockResolvedValue(false);

      await expect(
        service.subscribeToRepo('user@example.com', 'user/invalid-repo'),
      ).rejects.toThrow(NotFoundError);
    });

    it('не запускає сагу якщо репозиторій не знайдено на GitHub', async () => {
      const { service, repository, repoProvider, subscribeSaga } = makeService();
      repository.checkIfActiveExists.mockResolvedValue(false);
      repoProvider.exists.mockResolvedValue(false);

      await service.subscribeToRepo('user@example.com', 'user/invalid-repo').catch(() => {});

      expect(subscribeSaga.start).not.toHaveBeenCalled();
    });

    it('пробрасовує помилку якщо сага кинула виняток', async () => {
      const { service, repository, subscribeSaga } = makeService();
      repository.checkIfActiveExists.mockResolvedValue(false);
      subscribeSaga.start.mockRejectedValue(new Error('DB error'));

      await expect(service.subscribeToRepo('user@example.com', 'user/repo')).rejects.toThrow(
        'DB error',
      );
    });
  });

  describe('confirmSubscription', () => {
    it('кидає NotFoundError якщо токен не знайдено', async () => {
      const { service, repository } = makeService();
      repository.findByConfirmToken.mockResolvedValue(null);

      await expect(service.confirmSubscription('invalid-token')).rejects.toThrow(NotFoundError);
    });

    it('активує підписку за коректним id', async () => {
      const { service, repository } = makeService();
      repository.findByConfirmToken.mockResolvedValue(makeSubscription({ id: '42' }));
      repository.activate.mockResolvedValue(makeSubscription({ id: '42', status: 'ACTIVE' }));
      repository.countActive.mockResolvedValue(5);

      await service.confirmSubscription('valid-token');

      expect(repository.activate).toHaveBeenCalledWith('42');
    });

    it('повертає активовану підписку', async () => {
      const { service, repository } = makeService();
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
      const { service, repository } = makeService();
      repository.findByUnsubscribeToken.mockResolvedValue(null);

      await expect(service.unsubscribeFromRepo('invalid-token')).rejects.toThrow(NotFoundError);
    });

    it('видаляє підписку за id', async () => {
      const { service, repository } = makeService();
      repository.findByUnsubscribeToken.mockResolvedValue(makeSubscription({ id: '99' }));
      repository.delete.mockResolvedValue(makeSubscription({ id: '99' }));
      repository.countActive.mockResolvedValue(3);

      await service.unsubscribeFromRepo('valid-token');

      expect(repository.delete).toHaveBeenCalledWith('99');
    });

    it('повертає видалену підписку', async () => {
      const { service, repository } = makeService();
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
      const { service, repository } = makeService();
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
      const { service, repository } = makeService();
      repository.findByEmail.mockResolvedValue([]);

      await service.getSubscriptionsByEmail('user@example.com');

      expect(repository.findByEmail).toHaveBeenCalledWith('user@example.com');
    });

    it('повертає порожній масив якщо підписок немає', async () => {
      const { service, repository } = makeService();
      repository.findByEmail.mockResolvedValue([]);

      const result = await service.getSubscriptionsByEmail('unknown@example.com');

      expect(result).toEqual([]);
    });
  });

  describe('groupByRepository', () => {
    it('повертає список унікальних репозиторіїв', async () => {
      const { service, repository } = makeService();
      const repos: RepositoryGroup[] = [
        { repository: 'user/repo-a', count: 2 },
        { repository: 'user/repo-b', count: 1 },
      ];
      repository.groupByRepository.mockResolvedValue(repos);

      const result = await service.groupByRepository();

      expect(result).toEqual(repos);
    });

    it('повертає порожній масив якщо підписок немає', async () => {
      const { service, repository } = makeService();
      repository.groupByRepository.mockResolvedValue([]);

      const result = await service.groupByRepository();

      expect(result).toEqual([]);
    });
  });
});
