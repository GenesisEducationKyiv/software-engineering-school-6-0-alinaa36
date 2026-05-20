import { RepositoryFullName } from '../domain';

export class GithubQueryBuilder {
  buildLatestReleasesQuery(repos: RepositoryFullName[]): string {
    const repoFragments = repos.map((repoFullName, index) => {
      return `
        repo${index}: repository(owner: "${repoFullName.owner}", name: "${repoFullName.name}") {
          nameWithOwner
          latestRelease {
            tagName
          }
        }`;
    });

    return `query {\n${repoFragments.join('\n')}\n}`;
  }
}
