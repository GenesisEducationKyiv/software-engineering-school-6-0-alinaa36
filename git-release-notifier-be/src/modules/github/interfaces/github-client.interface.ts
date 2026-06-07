import type { BatchReleaseResult } from '../types/github-info.type';

export interface IGithubClient {
  getLatestReleasesBatch(repos: string[]): Promise<BatchReleaseResult>;
}
