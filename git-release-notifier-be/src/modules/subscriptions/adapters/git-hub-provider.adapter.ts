import type { IGithubClient } from '../../github/interfaces/github-client.interface';
import type { IRepositoryProvider } from '../interfaces/release-provider.interface';

export class GitHubRepoProviderAdapter implements IRepositoryProvider {
  constructor(private readonly githubClient: IGithubClient) {}

  async exists(repoFullName: string): Promise<boolean> {
    const result = await this.githubClient.getLatestReleasesBatch([repoFullName]);

    return repoFullName in result;
  }
}
