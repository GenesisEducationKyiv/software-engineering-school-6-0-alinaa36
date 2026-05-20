import { GithubHttpClient } from '../../github/client/github-http.client';
import { RedisCacheRepository } from '../cache/cache.repository';
import { GithubQueryBuilder } from '../../github/query/github-query.builder';
import { CachingGitHubClientDecorator } from '../../github/client/caching-github-client.decorator';
import { GithubReleaseService } from '../../github/services';

type Container = {
  githubReleaseService: GithubReleaseService;
};

export function createContainer(): Container {
  const cacheRepository = new RedisCacheRepository();

  const githubHttpClient = new CachingGitHubClientDecorator(
    new GithubHttpClient(new GithubQueryBuilder()),
    cacheRepository,
  );

  const githubReleaseService = new GithubReleaseService(githubHttpClient);

  return { githubReleaseService };
}
