import { describe, it, expect, vi } from 'vitest';
import { GithubService } from '../services/github.service';
import { GithubError } from '../../../lib/errors/app.error';
import { GithubQueryBuilder } from '../query/github-query.builder';
import { GithubResponseParser } from '../query/github-response.parser';
import { IGithubHttpClient } from '../client/github.client';
import { ICacheRepository } from '../../common/cache/cache-repository.interface';
import { GithubGraphQLResponse, GithubRepositoryNode } from '../types/github-info.type';

// ---- helpers ----

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
  const httpClient: IGithubHttpClient = {
    executeQuery: vi.fn(),
    ...overrides.httpClient,
  };

  const cache: ICacheRepository = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    ...overrides.cache,
  };

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
      const cached = { 'user/repo': 'v1.0.0' };
      const { service, httpClient } = makeService({
        cache: { get: vi.fn().mockResolvedValue(cached) },
      });

      const result = await service.getLatestReleasesBatch(['user/repo']);

      expect(result).toEqual(cached);
      expect(httpClient.executeQuery).not.toHaveBeenCalled();
    });

    it('генерує однаковий ключ кешу незалежно від порядку репозиторіїв', async () => {
      const getCacheMock = vi.fn().mockResolvedValue(null);
      const { service, httpClient } = makeService({
        cache: { get: getCacheMock },
      });

      vi.mocked(httpClient.executeQuery).mockResolvedValue(
        makeGraphQLResponse([
          { nameWithOwner: 'a/repo', tagName: 'v1.0.0' },
          { nameWithOwner: 'b/repo', tagName: 'v2.0.0' },
        ]),
      );

      await service.getLatestReleasesBatch(['b/repo', 'a/repo']);
      await service.getLatestReleasesBatch(['a/repo', 'b/repo']);

      const firstKey = getCacheMock.mock.calls[0][0];
      const secondKey = getCacheMock.mock.calls[1][0];

      expect(firstKey).toBe(secondKey);
    });

    it('зберігає результат у кеш після успішного запиту', async () => {
      const setCacheMock = vi.fn().mockResolvedValue(undefined);
      const { service, httpClient } = makeService({
        cache: { set: setCacheMock },
      });

      vi.mocked(httpClient.executeQuery).mockResolvedValue(
        makeGraphQLResponse([{ nameWithOwner: 'user/repo', tagName: 'v1.0.0' }]),
      );

      await service.getLatestReleasesBatch(['user/repo']);

      expect(setCacheMock).toHaveBeenCalledWith(
        expect.stringContaining('cache:github:releases:'),
        { 'user/repo': 'v1.0.0' },
        expect.any(Number),
      );
    });
  });

  // --- граничні випадки вхідних даних ---

  describe('вхідні дані', () => {
    it('повертає порожній обʼєкт для порожнього масиву без запиту', async () => {
      const { service, httpClient, cache } = makeService({});

      const result = await service.getLatestReleasesBatch([]);

      expect(result).toEqual({});
      expect(httpClient.executeQuery).not.toHaveBeenCalled();
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

      expect(result['user/active']).toBe('v2.0.0');
      expect(result['user/empty']).toBeNull();
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

      const error = await service.getLatestReleasesBatch(['user/repo']).catch((e) => e);

      expect(error).toBeInstanceOf(GithubError);
      expect(error.statusCode).toBe(404);
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

  // --- формування запиту ---

  describe('формування запиту', () => {
    it('сортує репозиторії перед побудовою запиту', async () => {
      const { service, httpClient } = makeService({});

      vi.mocked(httpClient.executeQuery).mockResolvedValue(
        makeGraphQLResponse([
          { nameWithOwner: 'a/repo', tagName: 'v1.0.0' },
          { nameWithOwner: 'b/repo', tagName: 'v1.0.0' },
        ]),
      );

      await service.getLatestReleasesBatch(['b/repo', 'a/repo']);

      const query = vi.mocked(httpClient.executeQuery).mock.calls[0][0];
      expect(query.indexOf('"a"')).toBeLessThan(query.indexOf('"b"'));
    });
  });
});
