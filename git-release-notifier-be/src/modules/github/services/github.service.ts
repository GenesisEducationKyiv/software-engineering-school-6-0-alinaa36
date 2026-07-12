import { redis } from '../../../lib/redis/redis';
import { Logger } from '../../../lib/logger/logger';
import { GithubError } from '../../../lib/errors/app.error';
import { BatchReleaseResult, GithubGraphQLResponse } from '../types/github-info.type';
import { GITHUB_GRAPHQL_URL, REDIS_CACHE_TTL_SECONDS } from '../../common/constants/api.constants';
import { config } from '../../../lib/config/env.config';

export class GithubService {
  private getHeaders() {
    return {
      Authorization: `Bearer ${config.github.token}`,
      'Content-Type': 'application/json',
    };
  }

  async getLatestReleasesBatch(repos: string[]): Promise<BatchReleaseResult> {
    if (repos.length === 0) {
      return {};
    }

    const sortedRepos = [...repos].sort();
    const batchHash = Buffer.from(sortedRepos.join(',')).toString('base64');
    const cacheKey = `cache:github:releases:${batchHash}`;

    const cachedData = await redis.get(cacheKey);
    if (cachedData) {
      Logger.info('[GitHub] Releases fetched quickly from Redis cache');
      return JSON.parse(cachedData) as BatchReleaseResult;
    }

    Logger.info('[GitHub] Cache miss. Fetching from API...');

    let query = 'query {\n';
    sortedRepos.forEach((repoFullName, index) => {
      const [owner, name] = repoFullName.split('/');
      query += `
        repo${index}: repository(owner: "${owner}", name: "${name}") {
          nameWithOwner
          latestRelease {
            tagName
          }
        }
      `;
    });
    query += '}\n';

    const response = await fetch(GITHUB_GRAPHQL_URL, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      throw new GithubError(`GraphQL API Error: ${response.statusText}`, response.status);
    }

    const json = (await response.json()) as GithubGraphQLResponse;
    const result: BatchReleaseResult = {};

    if (json.data) {
      Object.values(json.data).forEach((repoNode) => {
        if (repoNode && repoNode.nameWithOwner) {
          result[repoNode.nameWithOwner] = repoNode.latestRelease?.tagName || null;
        }
      });
    }

    await redis.set(cacheKey, JSON.stringify(result), 'EX', REDIS_CACHE_TTL_SECONDS);
    Logger.info('[GitHub] New data saved to Redis cache');

    return result;
  }
}
