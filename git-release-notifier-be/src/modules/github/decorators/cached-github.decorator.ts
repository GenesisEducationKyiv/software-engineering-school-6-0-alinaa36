import type { ICacheRepository } from '../../common/cache/cache-repository.interface';
import type { IGithubClient } from '../interfaces/github-client.interface';
import type { BatchReleaseResult } from '../types/github-info.type';

export class CachedGithubClient implements IGithubClient {
  constructor(
    private readonly client: IGithubClient,
    private readonly cache: ICacheRepository,
    private readonly ttlSeconds: number,
  ) {}

  async getLatestReleasesBatch(repos: string[]): Promise<BatchReleaseResult> {
    const cacheKey = this.buildCacheKey(repos);

    const cached = await this.cache.get<BatchReleaseResult>(cacheKey);
    if (cached) return cached;

    const result = await this.client.getLatestReleasesBatch(repos);
    await this.cache.set(cacheKey, result, this.ttlSeconds);

    return result;
  }

  private buildCacheKey(repos: string[]): string {
    const hash = Buffer.from([...repos].sort().join(',')).toString('base64');

    return `cache:github:releases:${hash}`;
  }
}
