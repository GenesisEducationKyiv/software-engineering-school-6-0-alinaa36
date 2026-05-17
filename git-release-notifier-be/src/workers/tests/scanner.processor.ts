import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/logger/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { Logger } from '../../lib/logger/logger';
import { ScanBatchProcessor } from '../scanner/scanner.processor';

// ---- helpers ----

function makeProvider(releases: Record<string, string | null> = {}) {
  return {
    getLatestReleasesBatch: vi.fn().mockResolvedValue(releases),
  };
}

function makeRepository(
  subscribers: Array<{ id: string; email: string; unsubscribeToken: string }> = [],
) {
  return {
    getOutdatedSubscribers: vi.fn().mockResolvedValue(subscribers),
    updateTags: vi.fn().mockResolvedValue(undefined),
  };
}

function makeNotifier() {
  return {
    sendReleaseNotification: vi.fn().mockResolvedValue(undefined),
  };
}

function makeProcessor(
  overrides: {
    releases?: Record<string, string | null>;
    subscribers?: Array<{ id: string; email: string; unsubscribeToken: string }>;
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
  beforeEach(() => vi.clearAllMocks());

  // --- базова поведінка ---

  describe('базова поведінка', () => {
    it('не робить нічого якщо масив репозиторіїв порожній', async () => {
      const { processor, provider } = makeProcessor();

      await processor.process([]);

      expect(provider.getLatestReleasesBatch).toHaveBeenCalledWith([]);
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
      const subscribers = [
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

      expect(notifier.sendReleaseNotification).toHaveBeenCalledWith(
        'a@example.com',
        'user/repo',
        'v2.0.0',
        'tok-a',
      );
    });

    it('оновлює тег після успішного надсилання листа', async () => {
      const { processor, repository } = makeProcessor({
        releases: { 'user/repo': 'v2.0.0' },
        subscribers: [{ id: '1', email: 'a@example.com', unsubscribeToken: 'tok' }],
      });

      await processor.process(['user/repo']);

      expect(repository.updateTags).toHaveBeenCalledWith(['1'], 'v2.0.0');
    });

    it('обробляє кілька репозиторіїв за один виклик', async () => {
      const provider = makeProvider({
        'user/repo-a': 'v1.0.0',
        'user/repo-b': 'v2.0.0',
      });
      const repository = makeRepository([
        { id: '1', email: 'a@example.com', unsubscribeToken: 'tok' },
      ]);
      const notifier = makeNotifier();
      const processor = new ScanBatchProcessor({ provider, repository, notifier });

      await processor.process(['user/repo-a', 'user/repo-b']);

      expect(notifier.sendReleaseNotification).toHaveBeenCalledTimes(2);
    });
  });

  // --- ізоляція помилок ---

  describe('ізоляція помилок', () => {
    it('не зупиняється якщо один лист не відправився', async () => {
      const subscribers = [
        { id: '1', email: 'a@example.com', unsubscribeToken: 'tok-a' },
        { id: '2', email: 'b@example.com', unsubscribeToken: 'tok-b' },
      ];
      const { processor, notifier, repository } = makeProcessor({
        releases: { 'user/repo': 'v2.0.0' },
        subscribers,
      });

      notifier.sendReleaseNotification
        .mockRejectedValueOnce(new Error('SMTP error'))
        .mockResolvedValueOnce(undefined);

      await processor.process(['user/repo']);

      // другий підписник отримав лист попри помилку першого
      expect(repository.updateTags).toHaveBeenCalledTimes(1);
      expect(repository.updateTags).toHaveBeenCalledWith(['2'], 'v2.0.0');
    });

    it('не оновлює тег якщо лист не відправився', async () => {
      const { processor, notifier, repository } = makeProcessor({
        releases: { 'user/repo': 'v2.0.0' },
        subscribers: [{ id: '1', email: 'a@example.com', unsubscribeToken: 'tok' }],
      });

      notifier.sendReleaseNotification.mockRejectedValue(new Error('SMTP error'));

      await processor.process(['user/repo']);

      expect(repository.updateTags).not.toHaveBeenCalled();
    });

    it('логує кількість невдалих нотифікацій', async () => {
      const subscribers = [
        { id: '1', email: 'a@example.com', unsubscribeToken: 'tok-a' },
        { id: '2', email: 'b@example.com', unsubscribeToken: 'tok-b' },
      ];
      const { processor, notifier } = makeProcessor({
        releases: { 'user/repo': 'v2.0.0' },
        subscribers,
      });

      notifier.sendReleaseNotification.mockRejectedValue(new Error('SMTP error'));

      await processor.process(['user/repo']);

      expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('2/2'));
    });
  });
});
