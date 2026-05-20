import { IGithubHttpClient } from '../interfaces';
import { RepositoryFullName } from '../domain';
import { GitHubLatestReleaseResponse, RepoNameToLatestTagMap } from '../types';

export class GithubReleaseService {
  constructor(private readonly githubHttpClient: IGithubHttpClient) {}

  async getRepoNameToLatestReleaseTagMap(repositories: string[]): Promise<RepoNameToLatestTagMap> {
    const response = await this.githubHttpClient.getRepositoryWithLatestReleaseTag(
      repositories.map((repo) => RepositoryFullName.parse(repo)),
    );

    return this.transformToLatestReleaseTagMap(response ?? {});
  }

  private transformToLatestReleaseTagMap(
    data: GitHubLatestReleaseResponse,
  ): RepoNameToLatestTagMap {
    const result: RepoNameToLatestTagMap = {};

    Object.values(data).forEach((repo) => {
      result[repo.nameWithOwner] = repo.latestRelease?.tagName ?? null;
    });

    return result;
  }
}
