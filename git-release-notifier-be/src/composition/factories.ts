import { config } from '../lib/config/env.config';
import { redis } from '../lib/redis/redis';
import { prisma } from '../lib/prisma';
import { GithubClient } from '../modules/github/client/github.client';
import { CachedGithubClient } from '../modules/github/decorators/cached-github.decorator';
import { RedisCacheRepository } from '../modules/common/cache/cache.repository';
import { QueueNotifier } from '../modules/sender/adapters/queue-notifier';
import { GrpcNotifier } from '../modules/sender/adapters/grpc-notifier';
import { RabbitEmailQueue } from '../modules/sender/adapters/rabbit-email-queue';
import type { INotifierService } from '../modules/sender/interfaces/notifier.interface';
import { SagaRepository } from '../modules/saga/repositories/saga.repository';
import { SubscribeSaga } from '../modules/saga/orchestrator/subscribe.saga';
import type {
  ISubscriptionRepository,
  ISubscriptionTagRepository,
} from '../modules/subscriptions/interfaces/subscription-repository.interface';

export function createCachedGithubClient(ttlSeconds: number): CachedGithubClient {
  return new CachedGithubClient(
    new GithubClient(config.github.token),
    new RedisCacheRepository(redis),
    ttlSeconds,
  );
}

export function createNotifier(tagRepository: ISubscriptionTagRepository): INotifierService {
  if (config.release.transport === 'grpc') {
    return new GrpcNotifier(config.release.grpcUrl, tagRepository);
  }

  return new QueueNotifier(new RabbitEmailQueue());
}

export function createSubscribeSaga(
  subscriptionRepository: ISubscriptionRepository,
): SubscribeSaga {
  return new SubscribeSaga(
    new SagaRepository(prisma),
    subscriptionRepository,
    new RabbitEmailQueue(),
  );
}
