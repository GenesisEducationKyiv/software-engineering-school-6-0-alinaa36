import { GitHubLatestReleaseResponse } from '../types';
import { RepositoryFullName } from '../domain';

export interface IGithubHttpClient {
  getRepositoryWithLatestReleaseTag(
    repos: RepositoryFullName[],
  ): Promise<GitHubLatestReleaseResponse | null>;
}
