import type { BatchReleaseResult, GithubGraphQLResponse } from '../types/github-info.type';

export class GithubResponseParser {
  parse(json: GithubGraphQLResponse): BatchReleaseResult {
    const result: BatchReleaseResult = {};

    if (!json.data) {
      return result;
    }

    Object.values(json.data).forEach((repoNode) => {
      if (repoNode?.nameWithOwner) {
        result[repoNode.nameWithOwner] = repoNode.latestRelease?.tagName ?? null;
      }
    });

    return result;
  }
}
