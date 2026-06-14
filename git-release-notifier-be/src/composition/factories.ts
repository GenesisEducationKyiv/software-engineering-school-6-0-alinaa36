import { config } from '../lib/config/env.config';
import { redis } from '../lib/redis/redis';
import { GithubClient } from '../modules/github/client/github.client';
import { CachedGithubClient } from '../modules/github/decorators/cached-github.decorator';
import { RedisCacheRepository } from '../modules/common/cache/cache.repository';
import { NotifierService } from '../modules/sender/services/mail.service';
import { SmtpProvider } from '../modules/sender/mail.provider';
import { MeteredNotifierService } from '../modules/sender/decorators/notifier.service.metered';

export function createCachedGithubClient(ttlSeconds: number): CachedGithubClient {
  return new CachedGithubClient(
    new GithubClient(config.github.token),
    new RedisCacheRepository(redis),
    ttlSeconds,
  );
}

export function createNotifier(): MeteredNotifierService {
  return new MeteredNotifierService(new NotifierService(new SmtpProvider()));
}
