import type { Mocked } from 'vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/metrics/metrics', () => ({
  activeSubscriptionsGauge: { set: vi.fn() },
}));

import { SubscriptionService } from '../services/subscription.service';
import { activeSubscriptionsGauge } from '../../../lib/metrics/metrics';
import { NotFoundError } from '../../../lib/errors/app.error';
import type { GithubService } from '../../github/services/github.service';
import type { NotifierService } from '../../sender/services/mail.service';

// ---- helpers ----

function makeRepository() {
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

function mockGithubService(): Mocked<GithubService> {
  return {
    getLatestReleasesBatch: vi.fn(),
  } as unknown as Mocked<GithubService>;
}

function mockNotifier(): Mocked<NotifierService> {
  return {
    sendConfirmationEmail: vi.fn().mockResolvedValue(undefined),
    sendReleaseNotification: vi.fn().mockResolvedValue(undefined),
  } as unknown as Mocked<NotifierService>;
}

describe('SubscriptionService', () => {
  let repository: ReturnType<typeof makeRepository>;
  let mockedGithubService: Mocked<GithubService>;
  let mockedNotifier: Mocked<NotifierService>;
  let service: SubscriptionService;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = makeRepository();
    mockedGithubService = mockGithubService();
    mockedNotifier = mockNotifier();
    service = new SubscriptionService(repository, mockedGithubService, mockedNotifier);
  });

  describe('subscribeToRepo', () => {
    beforeEach(() => {
      mockedGithubService.getLatestReleasesBatch.mockResolvedValue({
        'user/repo': 'v1.0.0',
      });
      repository.checkIfActiveExists.mockResolvedValue(false);
    });

    it('створює підписку через репозиторій', async () => {
      repository.upsertPending.mockResolvedValue({
        id: '1',
        confirmToken: 'tok',
        repository: 'user/repo',
      });

      await service.subscribeToRepo('user@example.com', 'user/repo');

      expect(mockedGithubService.getLatestReleasesBatch).toHaveBeenCalledWith(['user/repo']);
      expect(repository.upsertPending).toHaveBeenCalledWith('user@example.com', 'user/repo');
    });

    it('надсилає confirmation email з токеном', async () => {
      repository.upsertPending.mockResolvedValue({
        id: '1',
        confirmToken: 'confirm-tok',
        repository: 'user/repo',
      });

      await service.subscribeToRepo('user@example.com', 'user/repo');

      expect(mockedNotifier.sendConfirmationEmail).toHaveBeenCalledWith(
        'user@example.com',
        'user/repo',
        'confirm-tok',
      );
    });

    it('повертає створену підписку', async () => {
      const subscription = { id: '1', confirmToken: 'tok', repository: 'user/repo' };
      repository.upsertPending.mockResolvedValue(subscription);

      const result = await service.subscribeToRepo('user@example.com', 'user/repo');

      expect(result).toEqual(subscription);
    });

    it('пробрасовує помилку якщо репозиторій кинув виняток', async () => {
      repository.upsertPending.mockRejectedValue(new Error('DB error'));

      await expect(service.subscribeToRepo('user@example.com', 'user/repo')).rejects.toThrow(
        'DB error',
      );
    });

    it('кидає NotFoundError якщо репозиторій не знайдено на GitHub', async () => {
      mockedGithubService.getLatestReleasesBatch.mockResolvedValue({});

      await expect(
        service.subscribeToRepo('user@example.com', 'user/invalid-repo'),
      ).rejects.toThrow(NotFoundError);

      expect(repository.upsertPending).not.toHaveBeenCalled();
    });
  });

  describe('confirmSubscription', () => {
    it('кидає NotFoundError якщо токен не знайдено', async () => {
      repository.findByConfirmToken.mockResolvedValue(null);

      await expect(service.confirmSubscription('invalid')).rejects.toThrow(NotFoundError);
    });

    it('активує підписку за коректним id', async () => {
      repository.findByConfirmToken.mockResolvedValue({
        id: '42',
        email: 'test@ex.com',
        repository: 'user/repo',
        status: 'PENDING',
      });
      repository.activate.mockResolvedValue({ id: '42', status: 'ACTIVE' });
      repository.countActive.mockResolvedValue(5);

      await service.confirmSubscription('valid-token');

      expect(repository.activate).toHaveBeenCalledWith('42');
    });

    it('оновлює gauge після активації', async () => {
      repository.findByConfirmToken.mockResolvedValue({ id: '1', status: 'PENDING' });
      repository.activate.mockResolvedValue({ id: '1', status: 'ACTIVE' });
      repository.countActive.mockResolvedValue(7);

      await service.confirmSubscription('valid-token');

      expect(activeSubscriptionsGauge.set).toHaveBeenCalledWith(7);
    });

    it('повертає активовану підписку', async () => {
      const activated = { id: '1', status: 'ACTIVE' };
      repository.findByConfirmToken.mockResolvedValue({ id: '1', status: 'PENDING' });
      repository.activate.mockResolvedValue(activated);
      repository.countActive.mockResolvedValue(1);

      const result = await service.confirmSubscription('valid-token');

      expect(result).toEqual(activated);
    });
  });

  describe('unsubscribeFromRepo', () => {
    it('кидає NotFoundError якщо токен не знайдено', async () => {
      repository.findByUnsubscribeToken.mockResolvedValue(null);

      await expect(service.unsubscribeFromRepo('invalid')).rejects.toThrow(NotFoundError);
    });

    it('видаляє підписку за id', async () => {
      repository.findByUnsubscribeToken.mockResolvedValue({ id: '99' });
      repository.delete.mockResolvedValue({ id: '99' });
      repository.countActive.mockResolvedValue(3);

      await service.unsubscribeFromRepo('valid-token');

      expect(repository.delete).toHaveBeenCalledWith('99');
    });

    it('оновлює gauge після видалення', async () => {
      repository.findByUnsubscribeToken.mockResolvedValue({ id: '1' });
      repository.delete.mockResolvedValue({ id: '1' });
      repository.countActive.mockResolvedValue(2);

      await service.unsubscribeFromRepo('valid-token');

      expect(activeSubscriptionsGauge.set).toHaveBeenCalledWith(2);
    });

    it('повертає видалену підписку', async () => {
      const deleted = { id: '1', repository: 'user/repo' };
      repository.findByUnsubscribeToken.mockResolvedValue({ id: '1' });
      repository.delete.mockResolvedValue(deleted);
      repository.countActive.mockResolvedValue(0);

      const result = await service.unsubscribeFromRepo('valid-token');

      expect(result).toEqual(deleted);
    });
  });

  describe('getSubscriptionsByEmail', () => {
    it('повертає підписки для email', async () => {
      const subs = [{ id: '1', repository: 'user/repo' }];
      repository.findByEmail.mockResolvedValue(subs);

      const result = await service.getSubscriptionsByEmail('user@example.com');

      expect(result).toEqual(subs);
      expect(repository.findByEmail).toHaveBeenCalledWith('user@example.com');
    });

    it('повертає порожній масив якщо підписок немає', async () => {
      repository.findByEmail.mockResolvedValue([]);

      const result = await service.getSubscriptionsByEmail('unknown@example.com');

      expect(result).toEqual([]);
    });
  });

  describe('groupByRepository', () => {
    it('повертає список унікальних репозиторіїв', async () => {
      const repos = [{ repository: 'user/repo-a' }, { repository: 'user/repo-b' }];
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
