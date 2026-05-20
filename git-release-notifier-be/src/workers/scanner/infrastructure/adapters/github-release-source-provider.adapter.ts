import { IRepositoriesReleaseDataProvider, RepoNameToLatestTagMap } from '../../scanner.type';
import { GithubReleaseService } from '../../../../modules/github/services';

export class GithubReleaseSourceProviderAdapter implements IRepositoriesReleaseDataProvider {
  constructor(private readonly githubReleaseService: GithubReleaseService) {}

  async getLatestReleasesBatch(repos: string[]): Promise<RepoNameToLatestTagMap> {
    return await this.githubReleaseService.getRepoNameToLatestReleaseTagMap(repos);
  }
}
