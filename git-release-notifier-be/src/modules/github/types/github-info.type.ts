export interface BatchReleaseResult {
  [repoFullName: string]: string | null;
}

export interface GithubRepositoryNode {
  nameWithOwner: string;
  latestRelease: {
    tagName: string;
  } | null;
}

export interface GithubGraphQLError {
  type?: string;
  message: string;
}
