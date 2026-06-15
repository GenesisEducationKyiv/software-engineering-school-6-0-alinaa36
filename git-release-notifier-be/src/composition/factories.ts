import { config } from '../lib/config/env.config';
import { redis } from '../lib/redis/redis';
import { GithubClient } from '../modules/github/client/github.client';
import { CachedGithubClient } from '../modules/github/decorators/cached-github.decorator';
import { RedisCacheRepository } from '../modules/common/cache/cache.repository';
import { QueueNotifier } from '../modules/sender/adapters/queue-notifier';
import { RabbitEmailQueue } from '../modules/sender/adapters/rabbit-email-queue';
import type { INotifierService } from '../modules/sender/interfaces/notifier.interface';

export function createCachedGithubClient(ttlSeconds: number): CachedGithubClient {
  return new CachedGithubClient(
    new GithubClient(config.github.token),
    new RedisCacheRepository(redis),
    ttlSeconds,
  );
}

export function createNotifier(): INotifierService {
  return new QueueNotifier(new RabbitEmailQueue());
}
