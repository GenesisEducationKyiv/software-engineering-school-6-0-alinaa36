import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mocked } from 'vitest';
import { CachedGithubClient } from '../decorators/cached-github.decorator';
import type { IGithubClient } from '../interfaces/github-client.interface';
import type { ICacheRepository } from '../../common/cache/cache-repository.interface';
import type { BatchReleaseResult } from '../types/github-info.type';
import { REDIS_CACHE_TTL_SECONDS } from '../../common/constants/api.constants';

// ---- helpers ----

const RELEASES: BatchReleaseResult = {
  'facebook/react': 'v18.0.0',
  'vuejs/vue': 'v3.0.0',
};

function makeClient(releases: BatchReleaseResult = {}): Mocked<IGithubClient> {
  return {
    getLatestReleasesBatch: vi.fn().mockResolvedValue(releases),
  };
}

function makeCache(cached: BatchReleaseResult | null = null): Mocked<ICacheRepository> {
  return {
    get: vi.fn().mockResolvedValue(cached),
    set: vi.fn().mockResolvedValue(undefined),
  };
}

function makeDecorator(
  options: {
    releases?: BatchReleaseResult;
    cached?: BatchReleaseResult | null;
  } = {},
) {
  const client = makeClient(options.releases ?? {});
  const cache = makeCache(options.cached ?? null);
  const decorator = new CachedGithubClient(client, cache);

  return { decorator, client, cache };
}

// ---- тести ----

describe('CachedGithubClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('кеш-хіт — дані вже закешовані', () => {
    it('повертає закешований результат', async () => {
      const { decorator } = makeDecorator({ cached: RELEASES });

      const result = await decorator.getLatestReleasesBatch(['facebook/react']);

      expect(result).toEqual(RELEASES);
    });

    it('не звертається до GitHub', async () => {
      const { decorator, client } = makeDecorator({ cached: RELEASES });

      await decorator.getLatestReleasesBatch(['facebook/react']);

      expect(client.getLatestReleasesBatch).not.toHaveBeenCalled();
    });

    it('не перезаписує кеш', async () => {
      const { decorator, cache } = makeDecorator({ cached: RELEASES });

      await decorator.getLatestReleasesBatch(['facebook/react']);

      expect(cache.set).not.toHaveBeenCalled();
    });
  });

  describe('кеш-міс — даних у кеші немає', () => {
    it('звертається до GitHub з переданими репозиторіями', async () => {
      const { decorator, client } = makeDecorator({ releases: RELEASES });

      await decorator.getLatestReleasesBatch(['facebook/react', 'vuejs/vue']);

      expect(client.getLatestReleasesBatch).toHaveBeenCalledWith(['facebook/react', 'vuejs/vue']);
    });
  });

    it('повертає результат від GitHub', async () => {
      const { decorator } = makeDecorator({ releases: RELEASES });

      const result = await decorator.getLatestReleasesBatch(['facebook/react']);

      expect(result).toEqual(RELEASES);
    });

    it('зберігає результат у кеш з коректним TTL', async () => {
      const { decorator, cache } = makeDecorator({ releases: RELEASES });

      await decorator.getLatestReleasesBatch(['facebook/react']);

      expect(cache.set).toHaveBeenCalledWith(expect.any(String), RELEASES, REDIS_CACHE_TTL_SECONDS);
    });

    it('зберігає у кеш рівно один раз', async () => {
      const { decorator, cache } = makeDecorator({ releases: RELEASES });

      await decorator.getLatestReleasesBatch(['facebook/react']);

      expect(cache.set).toHaveBeenCalledTimes(1);
    });

    it('коректно обробляє репозиторій без жодного релізу', async () => {
      const releasesWithNull: BatchReleaseResult = { 'user/new-repo': null };
      const { decorator } = makeDecorator({ releases: releasesWithNull });

      const result = await decorator.getLatestReleasesBatch(['user/new-repo']);

      expect(result).toEqual(releasesWithNull);
    });
  });

  describe('ключ кешу', () => {
    it('однаковий ключ незалежно від порядку репозиторіїв', async () => {
      const { decorator, cache } = makeDecorator();

      await decorator.getLatestReleasesBatch(['b/repo', 'a/repo']);
      await decorator.getLatestReleasesBatch(['a/repo', 'b/repo']);

      const firstKey = cache.get.mock.calls[0][0];
      const secondKey = cache.get.mock.calls[1][0];

      expect(firstKey).toBe(secondKey);
    });

    it('різні набори репозиторіїв мають різні ключі', async () => {
      const { decorator, cache } = makeDecorator();

      await decorator.getLatestReleasesBatch(['user/repo-a']);
      await decorator.getLatestReleasesBatch(['user/repo-b']);

      const firstKey = cache.get.mock.calls[0][0];
      const secondKey = cache.get.mock.calls[1][0];

      expect(firstKey).not.toBe(secondKey);
    });

    it('ключ містить ідентифікуючий префікс', async () => {
      const { decorator, cache } = makeDecorator();

      await decorator.getLatestReleasesBatch(['user/repo']);

      expect(cache.get.mock.calls[0][0]).toMatch(/^cache:github:releases:/);
    });
  });

  describe('обробка помилок', () => {
    it('пробрасовує помилку від GitHub клієнта', async () => {
      const { decorator, client } = makeDecorator();
      client.getLatestReleasesBatch.mockRejectedValue(new Error('GitHub API error'));

      await expect(decorator.getLatestReleasesBatch(['user/repo'])).rejects.toThrow(
        'GitHub API error',
      );
    });

    it('не зберігає дані в кеш якщо запит до GitHub провалився', async () => {
      const { decorator, client, cache } = makeDecorator();
      client.getLatestReleasesBatch.mockRejectedValue(new Error('Network error'));

      await decorator.getLatestReleasesBatch(['user/repo']).catch(() => {});

      expect(cache.set).not.toHaveBeenCalled();
    });
  });
});
