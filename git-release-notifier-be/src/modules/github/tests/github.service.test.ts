import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/redis/redis', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock('../../../lib/logger/logger', () => ({
  Logger: { info: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../lib/config/env.config', () => ({
  config: { github: { token: 'test-token' } },
}));

vi.mock('../../common/constants/api.constants', () => ({
  GITHUB_GRAPHQL_URL: 'https://api.github.com/graphql',
  REDIS_CACHE_TTL_SECONDS: 60,
}));

import { redis } from '../../../lib/redis/redis';
import { GithubError } from '../../../lib/errors/app.error';
import { GithubService } from '../services/github.service';

// ---- helpers ----

function makeGraphQLResponse(repos: Array<{ nameWithOwner: string; tagName: string | null }>) {
  const data: Record<string, unknown> = {};
  repos.forEach((repo, i) => {
    data[`repo${i}`] = {
      nameWithOwner: repo.nameWithOwner,
      latestRelease: repo.tagName ? { tagName: repo.tagName } : null,
    };
  });
  return { ok: true, json: async () => ({ data }) };
}

// ---- тести ----

describe('GithubService.getLatestReleasesBatch', () => {
  let service: GithubService;
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = fetchMock;
    service = new GithubService();
  });

  // --- кеш ---

  describe('кешування', () => {
    it('повертає дані з кешу якщо вони є', async () => {
      const cached = { 'user/repo': 'v1.0.0' };
      vi.mocked(redis.get).mockResolvedValue(JSON.stringify(cached));

      const result = await service.getLatestReleasesBatch(['user/repo']);

      expect(result).toEqual(cached);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('генерує однаковий ключ кешу незалежно від порядку репозиторіїв', async () => {
      vi.mocked(redis.get).mockResolvedValue(null);
      fetchMock.mockResolvedValue(
        makeGraphQLResponse([
          { nameWithOwner: 'a/repo', tagName: 'v1.0.0' },
          { nameWithOwner: 'b/repo', tagName: 'v2.0.0' },
        ]),
      );

      await service.getLatestReleasesBatch(['b/repo', 'a/repo']);
      await service.getLatestReleasesBatch(['a/repo', 'b/repo']);

      const firstCallKey = vi.mocked(redis.get).mock.calls[0][0];
      const secondCallKey = vi.mocked(redis.get).mock.calls[1][0];

      expect(firstCallKey).toBe(secondCallKey);
    });

    it('зберігає результат у кеш після успішного запиту', async () => {
      vi.mocked(redis.get).mockResolvedValue(null);
      fetchMock.mockResolvedValue(
        makeGraphQLResponse([{ nameWithOwner: 'user/repo', tagName: 'v1.0.0' }]),
      );

      await service.getLatestReleasesBatch(['user/repo']);

      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining('cache:github:releases:'),
        JSON.stringify({ 'user/repo': 'v1.0.0' }),
        'EX',
        60,
      );
    });
  });

  // --- граничні випадки вхідних даних ---

  describe('вхідні дані', () => {
    it('повертає порожній обʼєкт для порожнього масиву без запиту', async () => {
      const result = await service.getLatestReleasesBatch([]);

      expect(result).toEqual({});
      expect(fetchMock).not.toHaveBeenCalled();
      expect(redis.get).not.toHaveBeenCalled();
    });
  });

  // --- парсинг відповіді ---

  describe('парсинг відповіді GitHub API', () => {
    beforeEach(() => {
      vi.mocked(redis.get).mockResolvedValue(null);
    });

    it('повертає теги для репозиторіїв з релізами', async () => {
      fetchMock.mockResolvedValue(
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
      fetchMock.mockResolvedValue(
        makeGraphQLResponse([{ nameWithOwner: 'user/empty-repo', tagName: null }]),
      );

      const result = await service.getLatestReleasesBatch(['user/empty-repo']);

      expect(result).toEqual({ 'user/empty-repo': null });
    });

    it('коректно обробляє змішані результати — є реліз і немає', async () => {
      fetchMock.mockResolvedValue(
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
      vi.mocked(redis.get).mockResolvedValue(null);
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            repo0: null, // GitHub повертає null якщо репо не знайдено
            repo1: { nameWithOwner: 'user/repo', latestRelease: { tagName: 'v1.0.0' } },
          },
        }),
      });

      const result = await service.getLatestReleasesBatch(['user/deleted', 'user/repo']);

      expect(result).toEqual({ 'user/repo': 'v1.0.0' });
      expect(result['user/deleted']).toBeUndefined();
    });
  });

  // --- помилки ---

  describe('обробка помилок', () => {
    beforeEach(() => {
      vi.mocked(redis.get).mockResolvedValue(null);
    });

    it('кидає GithubError якщо API повернуло не-ok статус', async () => {
      fetchMock.mockResolvedValue({ ok: false, statusText: 'Unauthorized', status: 401 });

      await expect(service.getLatestReleasesBatch(['user/repo'])).rejects.toThrow(GithubError);
    });

    it('GithubError містить HTTP статус код', async () => {
      fetchMock.mockResolvedValue({ ok: false, statusText: 'Not Found', status: 404 });

      const error = await service.getLatestReleasesBatch(['user/repo']).catch((e) => e);

      expect(error).toBeInstanceOf(GithubError);
      expect(error.statusCode).toBe(404);
    });

    it('не зберігає дані в кеш якщо запит провалився', async () => {
      fetchMock.mockResolvedValue({ ok: false, statusText: 'Server Error', status: 500 });

      await service.getLatestReleasesBatch(['user/repo']).catch(() => {});

      expect(redis.set).not.toHaveBeenCalled();
    });

    it('пробрасовує мережеву помилку fetch', async () => {
      fetchMock.mockRejectedValue(new Error('Network error'));

      await expect(service.getLatestReleasesBatch(['user/repo'])).rejects.toThrow('Network error');
    });
  });

  // --- формування GraphQL запиту ---

  describe('формування запиту', () => {
    beforeEach(() => {
      vi.mocked(redis.get).mockResolvedValue(null);
      fetchMock.mockResolvedValue(
        makeGraphQLResponse([{ nameWithOwner: 'user/repo', tagName: 'v1.0.0' }]),
      );
    });

    it('відправляє Authorization header з токеном', async () => {
      await service.getLatestReleasesBatch(['user/repo']);

      const headers = fetchMock.mock.calls[0][1].headers;
      expect(headers.Authorization).toBe('Bearer test-token');
    });

    it('сортує репозиторії перед побудовою запиту', async () => {
      fetchMock.mockResolvedValue(
        makeGraphQLResponse([
          { nameWithOwner: 'a/repo', tagName: 'v1.0.0' },
          { nameWithOwner: 'b/repo', tagName: 'v1.0.0' },
        ]),
      );

      await service.getLatestReleasesBatch(['b/repo', 'a/repo']);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      const aIndex = body.query.indexOf('a/repo') > -1 ? body.query.indexOf('"a"') : -1;
      const bIndex = body.query.indexOf('"b"');

      expect(aIndex).toBeLessThan(bIndex);
    });
  });
});
