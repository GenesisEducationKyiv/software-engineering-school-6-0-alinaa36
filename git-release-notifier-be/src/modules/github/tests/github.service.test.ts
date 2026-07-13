import { describe, it, expect, vi } from 'vitest';
import { GithubService } from '../services/github.service';
import { GithubError } from '../../../lib/errors/app.error';
import { GithubQueryBuilder } from '../query/github-query.builder';
import { GithubResponseParser } from '../query/github-response.parser';
import type { IGithubHttpClient } from '../client/github.client';
import type { ICacheRepository } from '../../common/cache/cache-repository.interface';
import type { GithubGraphQLResponse, GithubRepositoryNode } from '../types/github-info.type';

vi.mock('../../../lib/logger/logger', () => ({
  Logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

function makeGraphQLResponse(
  repos: Array<{ nameWithOwner: string; tagName: string | null }>,
): GithubGraphQLResponse {
  const data: Record<string, GithubRepositoryNode | null> = {};
  repos.forEach((repo, i) => {
    data[`repo${i}`] = {
      nameWithOwner: repo.nameWithOwner,
      latestRelease: repo.tagName ? { tagName: repo.tagName } : null,
    };
  });

  return { data };
}

function makeService(overrides: {
  httpClient?: Partial<IGithubHttpClient>;
  cache?: Partial<ICacheRepository>;
}) {
  const httpClient = {
    executeQuery: vi.fn(),
    ...overrides.httpClient,
  } satisfies IGithubHttpClient;

  const cache = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    ...overrides.cache,
  } satisfies ICacheRepository;

  const service = new GithubService(
    httpClient,
    cache,
    new GithubQueryBuilder(),
    new GithubResponseParser(),
  );

  return { service, httpClient, cache };
}

// ---- тести ----

describe('GithubService.getLatestReleasesBatch', () => {
  // --- кеш ---

  describe('кешування', () => {
    it('повертає дані з кешу якщо вони є', async () => {
      const cachedData = { 'user/repo': 'v1.0.0' };
      const { service } = makeService({
        cache: { get: vi.fn().mockResolvedValue(cachedData) },
      });

      const result = await service.getLatestReleasesBatch(['user/repo']);

      expect(result).toEqual(cachedData);
    });

    it('не робить запит до GitHub якщо дані є в кеші', async () => {
      const cachedData = { 'user/repo': 'v1.0.0' };
      const { service, httpClient } = makeService({
        cache: { get: vi.fn().mockResolvedValue(cachedData) },
      });

      await service.getLatestReleasesBatch(['user/repo']);

      expect(httpClient.executeQuery).not.toHaveBeenCalled();
    });
  });

  // --- граничні випадки вхідних даних ---

  describe('вхідні дані', () => {
    it('повертає порожній обʼєкт для порожнього масиву', async () => {
      const { service } = makeService({});

      const result = await service.getLatestReleasesBatch([]);

      expect(result).toEqual({});
    });

    it('не робить запит до GitHub для порожнього масиву', async () => {
      const { service, httpClient } = makeService({});

      await service.getLatestReleasesBatch([]);

      expect(httpClient.executeQuery).not.toHaveBeenCalled();
    });

    it('не звертається до кешу для порожнього масиву', async () => {
      const { service, cache } = makeService({});

      await service.getLatestReleasesBatch([]);

      expect(cache.get).not.toHaveBeenCalled();
    });
  });

  // --- парсинг відповіді ---

  describe('парсинг відповіді GitHub API', () => {
    it('повертає теги для репозиторіїв з релізами', async () => {
      const { service, httpClient } = makeService({});

      vi.mocked(httpClient.executeQuery).mockResolvedValue(
        makeGraphQLResponse([
          { nameWithOwner: 'facebook/react', tagName: 'v18.0.0' },
          { nameWithOwner: 'vuejs/vue', tagName: 'v3.0.0' },
        ]),
      );

      const result = await service.getLatestReleasesBatch(['facebook/react', 'vuejs/vue']);

      expect(result).toEqual({
        'facebook/react': 'v18.0.0',
        'vuejs/vue': 'v3.0.0',
      });
    });

    it('повертає null для репозиторію без релізів', async () => {
      const { service, httpClient } = makeService({});

      vi.mocked(httpClient.executeQuery).mockResolvedValue(
        makeGraphQLResponse([{ nameWithOwner: 'user/empty-repo', tagName: null }]),
      );

      const result = await service.getLatestReleasesBatch(['user/empty-repo']);

      expect(result).toEqual({ 'user/empty-repo': null });
    });

    it('коректно обробляє змішані результати — є реліз і немає', async () => {
      const { service, httpClient } = makeService({});

      vi.mocked(httpClient.executeQuery).mockResolvedValue(
        makeGraphQLResponse([
          { nameWithOwner: 'user/active', tagName: 'v2.0.0' },
          { nameWithOwner: 'user/empty', tagName: null },
        ]),
      );

      const result = await service.getLatestReleasesBatch(['user/active', 'user/empty']);

      expect(result).toEqual({ 'user/active': 'v2.0.0', 'user/empty': null });
    });

    it('ігнорує null-вузли у відповіді GraphQL', async () => {
      const { service, httpClient } = makeService({});

      vi.mocked(httpClient.executeQuery).mockResolvedValue({
        data: {
          repo0: null,
          repo1: { nameWithOwner: 'user/repo', latestRelease: { tagName: 'v1.0.0' } },
        },
      });

      const result = await service.getLatestReleasesBatch(['user/deleted', 'user/repo']);

      expect(result).toEqual({ 'user/repo': 'v1.0.0' });
      expect(result['user/deleted']).toBeUndefined();
    });
  });

  // --- помилки ---

  describe('обробка помилок', () => {
    it('пробрасовує GithubError від httpClient', async () => {
      const { service, httpClient } = makeService({});

      vi.mocked(httpClient.executeQuery).mockRejectedValue(
        new GithubError('GraphQL API Error: Unauthorized', 401),
      );

      await expect(service.getLatestReleasesBatch(['user/repo'])).rejects.toThrow(GithubError);
    });

    it('GithubError містить HTTP статус код', async () => {
      const { service, httpClient } = makeService({});

      vi.mocked(httpClient.executeQuery).mockRejectedValue(
        new GithubError('GraphQL API Error: Not Found', 404),
      );

      await expect(service.getLatestReleasesBatch(['user/repo'])).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('не зберігає дані в кеш якщо запит провалився', async () => {
      const setCacheMock = vi.fn();
      const { service, httpClient } = makeService({
        cache: { set: setCacheMock },
      });

      vi.mocked(httpClient.executeQuery).mockRejectedValue(
        new GithubError('GraphQL API Error: Server Error', 500),
      );

      await service.getLatestReleasesBatch(['user/repo']).catch(() => {});

      expect(setCacheMock).not.toHaveBeenCalled();
    });

    it('пробрасовує мережеву помилку від httpClient', async () => {
      const { service, httpClient } = makeService({});

      vi.mocked(httpClient.executeQuery).mockRejectedValue(new Error('Network error'));

      await expect(service.getLatestReleasesBatch(['user/repo'])).rejects.toThrow('Network error');
    });
  });
});
