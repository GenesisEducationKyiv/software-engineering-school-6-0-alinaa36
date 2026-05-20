import { IRepositoryProvider } from '../../interfaces';
import { GithubReleaseService } from '../../../github/services';

export class GitHubRepoProviderAdapter implements IRepositoryProvider {
  constructor(private readonly githubReleaseService: GithubReleaseService) {}

  async exists(repoFullName: string): Promise<boolean> {
    const repoNameToLatestTagMap = await this.githubReleaseService.getRepoNameToLatestReleaseTagMap(
      [repoFullName],
    );

    return Object.keys(repoNameToLatestTagMap).some((repository) => repository === repoFullName);
  }
}
