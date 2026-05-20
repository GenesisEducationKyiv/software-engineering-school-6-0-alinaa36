export type GitHubLatestReleaseResponse = Record<string, GitHubRepoWithLatestRelease>;

// TODO use codegen to generate TS types based on requested fragments
type GitHubRepoWithLatestRelease = {
  nameWithOwner: string;
  latestRelease: {
    tagName: string;
  } | null;
};
