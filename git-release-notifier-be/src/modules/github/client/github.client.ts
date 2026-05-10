import { GithubGraphQLResponse } from '../types/github-info.type';
import { GITHUB_GRAPHQL_URL } from '../../common/constants/api.constants';
import { GithubError } from '../../../lib/errors/app.error';

export interface IGithubHttpClient {
  executeQuery(query: string): Promise<GithubGraphQLResponse>;
}

export class GithubHttpClient implements IGithubHttpClient {
  constructor(private readonly getHeaders: () => Record<string, string>) {}

  async executeQuery(query: string): Promise<GithubGraphQLResponse> {
    const response = await fetch(GITHUB_GRAPHQL_URL, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      throw new GithubError(`GraphQL API Error: ${response.statusText}`, response.status);
    }

    return response.json() as Promise<GithubGraphQLResponse>;
  }
}
