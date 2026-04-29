export interface BatchReleaseResult {
  [repoFullName: string]: string | null;
}

export interface GithubRepositoryNode {
  nameWithOwner: string;
  latestRelease: {
    tagName: string;
  } | null;
}

export interface GithubGraphQLResponse {
  data?: Record<string, GithubRepositoryNode | null>;
  errors?: Array<{ message: string }>;
}

export interface GithubRestRepoInfo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
}

export interface GithubRestReleaseInfo {
  id: number;
  tag_name: string;
  name: string | null;
  published_at: string;
  html_url: string;
}
