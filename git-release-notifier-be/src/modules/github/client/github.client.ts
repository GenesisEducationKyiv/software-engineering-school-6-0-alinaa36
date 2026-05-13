import { GithubGraphQLResponse } from '../types/github-info.type';
import { GITHUB_GRAPHQL_URL } from '../../common/constants/api.constants';
import { GithubError } from '../../../lib/errors/app.error';
import { config } from '../../../lib/config/env.config';

export interface IGithubHttpClient {
  executeQuery(query: string): Promise<GithubGraphQLResponse>;
}

export class GithubHttpClient implements IGithubHttpClient {
  constructor(private readonly getHeaders: () => Record<string, string>) {}

  static create(): GithubHttpClient {
    return new GithubHttpClient(() => ({
      Authorization: `Bearer ${config.github.token}`,
      'Content-Type': 'application/json',
    }));
  }

  async executeQuery(query: string): Promise<GithubGraphQLResponse> {
    const response = await fetch(GITHUB_GRAPHQL_URL, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      throw new GithubError(`GraphQL API Error: ${response.statusText}`, response.status);
    }

    const json = (await response.json()) as GithubGraphQLResponse;

    if (json.errors?.length) {
      throw new GithubError(`GraphQL Error: ${json.errors[0].message}`, 200);
    }

    return json;
  }
}
