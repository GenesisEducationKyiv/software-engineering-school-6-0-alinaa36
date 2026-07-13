import { GITHUB_GRAPHQL_URL } from '../../common/constants/api.constants';
import { GraphQLClient } from 'graphql-request';
import type { BatchReleaseResult, GithubRepositoryNode } from '../types/github-info.type';
import { buildLatestReleasesQuery, parseLatestReleases } from '../query/latest-releases';
import type { IGithubClient } from '../interfaces/github-client.interface';
import { ErrorCode, GithubError, GithubRateLimitError } from '../../../lib/errors/app.error';

export class GithubClient implements IGithubClient {
  private readonly client: GraphQLClient;

  constructor(token: string) {
    this.client = new GraphQLClient(GITHUB_GRAPHQL_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      errorPolicy: 'all',
    });
  }

  async getLatestReleasesBatch(repos: string[]): Promise<BatchReleaseResult> {
    try {
      const query = buildLatestReleasesQuery(repos);
      const data = await this.client.request<Record<string, GithubRepositoryNode | null>>(query);

      return parseLatestReleases(data);
    } catch (error) {
      if (this.isRateLimited(error)) {
        throw new GithubRateLimitError({ cause: error });
      }

      throw new GithubError(ErrorCode.GITHUB_UNAVAILABLE, { cause: error });
    }
  }

  private isRateLimited(error: unknown): boolean {
    const status = (error as { response?: { status?: number } }).response?.status;

    return status === 403 || status === 429;
  }
}
