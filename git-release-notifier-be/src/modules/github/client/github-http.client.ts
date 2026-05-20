import { GITHUB_GRAPHQL_URL } from '../../common/constants/api.constants';
import { config } from '../../../lib/config/env.config';
import { GithubQueryBuilder } from '../query/github-query.builder';
import { GitHubLatestReleaseResponse } from '../types';
import { IGithubHttpClient } from '../interfaces';
import { RepositoryFullName } from '../domain';
import { GithubApiError } from '../errors';
import { Logger } from '../../../lib/logger/logger';

export class GithubHttpClient implements IGithubHttpClient {
  private readonly headers: Record<string, string>;
  private readonly baseUrl: string;

  constructor(private readonly queryBuilder: GithubQueryBuilder) {
    this.headers = {
      Authorization: `Bearer ${config.github.token}`,
      'Content-Type': 'application/json',
    };
    this.baseUrl = GITHUB_GRAPHQL_URL;
  }

  private async executeQuery<TResponse>(query: string): Promise<TResponse | null> {
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        throw new GithubApiError(response.statusText);
      }

      const result = await response.json();

      if (!result.data && result.errors) {
        throw new GithubApiError('GitHub API error'); // TODO pass errors here as cause
      }

      if (result.errors) {
        Logger.error(`Error while performing request to Github: ${JSON.stringify(result.errors)}`);
      }

      return result.data ?? null;
    } catch (error) {
      if (error instanceof GithubApiError) throw error;
      throw new GithubApiError('GitHub API error'); // TODO pass also error here as cause parameter
    }
  }

  async getRepositoryWithLatestReleaseTag(
    repos: RepositoryFullName[],
  ): Promise<GitHubLatestReleaseResponse | null> {
    const query = this.queryBuilder.buildLatestReleasesQuery(repos);

    return await this.executeQuery<GitHubLatestReleaseResponse>(query);
  }
}
