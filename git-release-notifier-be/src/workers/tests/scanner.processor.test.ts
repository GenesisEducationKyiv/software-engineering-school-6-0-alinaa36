import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/logger/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { ScanBatchProcessor } from '../scanner/scanner.processor';
import type { ISourceProvider, INotifier } from '../scanner/interfaces/scanner.interfaces';

// ---- типи ----

type TestSubscriber = OutdatedSubscriber;

// ---- helpers ----

import type { Mocked } from 'vitest';
import type {
  IScannerSubscriptionRepository,
  OutdatedSubscriber,
} from '../../modules/subscriptions/interfaces/subscription-repository.interface';

function makeNotifier(): Mocked<INotifier> {
  return {
    sendReleaseNotification: vi.fn().mockResolvedValue(undefined),
  };
}

function makeProvider(releases: Record<string, string | null> = {}): Mocked<ISourceProvider> {
  return {
    getLatestReleasesBatch: vi.fn().mockResolvedValue(releases),
  };
}

function makeRepository(
  subscribers: TestSubscriber[] = [],
): Mocked<IScannerSubscriptionRepository> {
  return {
    getOutdatedSubscribers: vi.fn().mockResolvedValue(subscribers),
  };
}

function makeProcessor(
  overrides: {
    releases?: Record<string, string | null>;
    subscribers?: TestSubscriber[];
  } = {},
) {
  const provider = makeProvider(overrides.releases ?? {});
  const repository = makeRepository(overrides.subscribers ?? []);
  const notifier = makeNotifier();
  const processor = new ScanBatchProcessor({ provider, repository, notifier });

  return { processor, provider, repository, notifier };
}

// ---- тести ----

describe('ScanBatchProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- базова поведінка ---

  describe('базова поведінка', () => {
    it('не викликає getLatestReleasesBatch з порожнім масивом', async () => {
      const { processor, provider } = makeProcessor();

      await processor.process([]);

      expect(provider.getLatestReleasesBatch).not.toHaveBeenCalled();
    });

    it('не надсилає листів якщо немає нових релізів', async () => {
      const { processor, notifier } = makeProcessor({
        releases: { 'user/repo': null },
      });

      await processor.process(['user/repo']);

      expect(notifier.sendReleaseNotification).not.toHaveBeenCalled();
    });

    it('не надсилає листів якщо всі підписники вже бачили тег', async () => {
      const { processor, notifier } = makeProcessor({
        releases: { 'user/repo': 'v2.0.0' },
        subscribers: [],
      });

      await processor.process(['user/repo']);

      expect(notifier.sendReleaseNotification).not.toHaveBeenCalled();
    });
  });

  // --- нотифікація ---

  describe('нотифікація підписників', () => {
    it('надсилає лист кожному підписнику', async () => {
      const subscribers: TestSubscriber[] = [
        { id: '1', email: 'a@example.com', unsubscribeToken: 'tok-a' },
        { id: '2', email: 'b@example.com', unsubscribeToken: 'tok-b' },
      ];
      const { processor, notifier } = makeProcessor({
        releases: { 'user/repo': 'v2.0.0' },
        subscribers,
      });

      await processor.process(['user/repo']);

      expect(notifier.sendReleaseNotification).toHaveBeenCalledTimes(2);
    });

    it('передає коректні аргументи в sendReleaseNotification', async () => {
      const { processor, notifier } = makeProcessor({
        releases: { 'user/repo': 'v2.0.0' },
        subscribers: [{ id: '1', email: 'a@example.com', unsubscribeToken: 'tok-a' }],
      });

      await processor.process(['user/repo']);

      expect(notifier.sendReleaseNotification).toHaveBeenCalledWith({
        email: 'a@example.com',
        repo: 'user/repo',
        tag: 'v2.0.0',
        unsubscribeToken: 'tok-a',
      });
    });

    it('обробляє кілька репозиторіїв за один виклик', async () => {
      const { processor, notifier } = makeProcessor({
        releases: {
          'user/repo-a': 'v1.0.0',
          'user/repo-b': 'v2.0.0',
        },
        subscribers: [{ id: '1', email: 'a@example.com', unsubscribeToken: 'tok' }],
      });

      await processor.process(['user/repo-a', 'user/repo-b']);

      expect(notifier.sendReleaseNotification).toHaveBeenCalledWith({
        email: 'a@example.com',
        repo: 'user/repo-a',
        tag: 'v1.0.0',
        unsubscribeToken: 'tok',
      });
      expect(notifier.sendReleaseNotification).toHaveBeenCalledWith({
        email: 'a@example.com',
        repo: 'user/repo-b',
        tag: 'v2.0.0',
        unsubscribeToken: 'tok',
      });
    });
  });

  // --- ізоляція помилок ---

  describe('ізоляція помилок', () => {
    it('продовжує обробку якщо один лист не відправився', async () => {
      const subscribers: TestSubscriber[] = [
        { id: '1', email: 'a@example.com', unsubscribeToken: 'tok-a' },
        { id: '2', email: 'b@example.com', unsubscribeToken: 'tok-b' },
      ];
      const { processor, notifier } = makeProcessor({
        releases: { 'user/repo': 'v2.0.0' },
        subscribers,
      });

      notifier.sendReleaseNotification
        .mockRejectedValueOnce(new Error('SMTP error'))
        .mockResolvedValueOnce(undefined);

      await processor.process(['user/repo']);

      expect(notifier.sendReleaseNotification).toHaveBeenCalledTimes(2);
    });
  });
});
