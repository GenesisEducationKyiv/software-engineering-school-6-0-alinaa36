import { config } from '../../lib/config/env.config';
import { prisma } from '../../lib/prisma';
import { redis } from '../../lib/redis/redis';
import { GithubClient } from '../../modules/github/client/github.client';
import type { ILockStore } from '../../modules/queue/interfaces/lock-store.interface';
import { SubscriptionRepository } from '../../modules/subscriptions/repositories/subscription.repository';
import { GithubReleaseAdapter } from '../../workers/scanner/infrastructure/adapters/github-release-source-provider.adapter';
import { MeteredScanBatchProcessor } from '../../workers/scanner/infrastructure/decorators/scanner.processor.metered';
import { RedisLockStore } from '../../modules/queue/adapters/redis-lock.store';
import type { IBatchProcessor } from '../../workers/scanner/interfaces/scanner.interfaces';
import { ScanBatchProcessor } from '../../workers/scanner/scanner.processor';
import { createNotifier } from '../factories';

export type WorkerContainer = {
  processor: IBatchProcessor;
  lockStore: ILockStore;
};

export function createWorkerContainer(): WorkerContainer {
  const githubClient = new GithubClient(config.github.token);
  const notifier = createNotifier();
  const lockStore = new RedisLockStore(redis);

  const processor = new MeteredScanBatchProcessor(
    new ScanBatchProcessor({
      provider: new GithubReleaseAdapter(githubClient),
      notifier,
      repository: new SubscriptionRepository(prisma),
    }),
  );

  return { processor, lockStore };
}
