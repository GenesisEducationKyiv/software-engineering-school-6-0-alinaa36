export class GithubQueryBuilder {
  buildLatestReleasesQuery(repos: string[]): string {
    const repoFragments = repos.map((repoFullName, index) => {
      const [owner, name] = repoFullName.split('/');
      
return `
        repo${index}: repository(owner: "${owner}", name: "${name}") {
          nameWithOwner
          latestRelease {
            tagName
          }
        }`;
    });

    return `query {\n${repoFragments.join('\n')}\n}`;
  }
}
