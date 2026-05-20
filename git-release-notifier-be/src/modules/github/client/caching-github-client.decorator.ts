import { IGithubHttpClient } from '../interfaces';
import { GitHubLatestReleaseResponse } from '../types';
import { ICacheRepository } from '../../common/cache/cache-repository.interface';
import { Logger } from '../../../lib/logger/logger';
import { REDIS_CACHE_TTL_SECONDS } from '../../common/constants/api.constants';
import { RepositoryFullName } from '../domain';

export class CachingGitHubClientDecorator implements IGithubHttpClient {
  constructor(
    private readonly client: IGithubHttpClient,
    private readonly cache: ICacheRepository,
  ) {}

  async getRepositoryWithLatestReleaseTag(
    repos: RepositoryFullName[],
  ): Promise<GitHubLatestReleaseResponse | null> {
    const sortedRepos = [...repos].sort((a, b) => a.toString().localeCompare(b.toString()));

    const cacheKey = this.buildCacheKey(sortedRepos, 'repos');

    const cached = await this.cache.get<GitHubLatestReleaseResponse>(cacheKey);
    if (cached) {
      Logger.info('[GitHub] Releases fetched from Redis cache');
      return cached;
    }

    Logger.info('[GitHub] Cache miss. Fetching from API...');

    const result = await this.client.getRepositoryWithLatestReleaseTag(sortedRepos);

    await this.cache.set(cacheKey, result, REDIS_CACHE_TTL_SECONDS);
    Logger.info('[GitHub] New data saved to Redis cache');

    return result;
  }

  // TODO improve this method by performing deepSort inside so that consumers would not need to care about that
  private buildCacheKey(input: unknown, cacheKey: string): string {
    const hash = Buffer.from(JSON.stringify(input)).toString('base64');

    return `cache:github:${cacheKey}:${hash}`;
  }
}
