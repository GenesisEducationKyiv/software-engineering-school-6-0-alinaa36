import { gql } from 'graphql-request';
import type { GithubRepositoryNode, BatchReleaseResult } from '../types/github-info.type';

const REPOSITORY_FIELDS = gql`
  fragment RepositoryFields on Repository {
    nameWithOwner
    latestRelease {
      tagName
    }
  }
`;

export function buildLatestReleasesQuery(repos: string[]): string {
  const aliases = repos
    .map((fullName, index) => {
      const [owner, name] = fullName.split('/');

      return `
        repo${index}: repository(owner: "${owner}", name: "${name}") {
          ...RepositoryFields
        }
      `;
    })
    .join('\n');

  return gql`
    query LatestReleases {
      ${aliases}
    }
    ${REPOSITORY_FIELDS}
  `;
}

export function parseLatestReleases(
  data: Record<string, GithubRepositoryNode | null>,
): BatchReleaseResult {
  return Object.values(data).reduce<BatchReleaseResult>((acc, repoNode) => {
    if (repoNode?.nameWithOwner) {
      acc[repoNode.nameWithOwner] = repoNode.latestRelease?.tagName ?? null;
    }

    return acc;
  }, {});
}
