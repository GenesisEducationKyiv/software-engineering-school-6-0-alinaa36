import type { IGithubClient } from '../../../../modules/github/interfaces/github-client.interface';
import type { ISourceProvider } from '../../interfaces/scanner.interfaces';
import type { BatchReleaseResult } from '../../../../modules/github/types/github-info.type';

export class GithubReleaseAdapter implements ISourceProvider {
  constructor(private readonly githubClient: IGithubClient) {}

  async getLatestReleasesBatch(repos: string[]): Promise<BatchReleaseResult> {
    const result = await this.githubClient.getLatestReleasesBatch(repos);

    return Object.fromEntries(Object.entries(result).filter(([, value]) => value !== null));
  }
}
