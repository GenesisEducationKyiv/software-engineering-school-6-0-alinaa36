import { Logger } from '../../../lib/logger/logger';
import { BatchReleaseResult } from '../types/github-info.type';
import { REDIS_CACHE_TTL_SECONDS } from '../../common/constants/api.constants';
import { ICacheRepository } from '../../common/cache/cache-repository.interface';
import { GithubQueryBuilder } from '../query/github-query.builder';
import { GithubResponseParser } from '../query/github-response.parser';
import { IGithubHttpClient } from '../client/github.client';

export class GithubService {
  constructor(
    private readonly httpClient: IGithubHttpClient,
    private readonly cache: ICacheRepository,
    private readonly queryBuilder: GithubQueryBuilder,
    private readonly responseParser: GithubResponseParser,
  ) {}

  async getLatestReleasesBatch(repos: string[]): Promise<BatchReleaseResult> {
    if (repos.length === 0) {
      return {};
    }

    const cacheKey = this.buildCacheKey(repos);

    const cached = await this.cache.get<BatchReleaseResult>(cacheKey);
    if (cached) {
      Logger.info('[GitHub] Releases fetched from Redis cache');
      return cached;
    }

    Logger.info('[GitHub] Cache miss. Fetching from API...');

    const sortedRepos = [...repos].sort();
    const query = this.queryBuilder.buildLatestReleasesQuery(sortedRepos);
    const json = await this.httpClient.executeQuery(query);
    const result = this.responseParser.parse(json);

    await this.cache.set(cacheKey, result, REDIS_CACHE_TTL_SECONDS);
    Logger.info('[GitHub] New data saved to Redis cache');

    return result;
  }

  private buildCacheKey(repos: string[]): string {
    const sorted = [...repos].sort();
    const hash = Buffer.from(sorted.join(',')).toString('base64');
    return `cache:github:releases:${hash}`;
  }
}
