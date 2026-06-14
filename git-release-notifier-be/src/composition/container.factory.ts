import { config } from '../lib/config/env.config';
import { redis } from '../lib/redis/redis';
import { activeSubscriptionsGauge } from '../lib/metrics/metrics';
import { GithubReleaseAdapter } from '../workers/scanner/infrastructure/adapters/github-release-source-provider.adapter';
import type { ILockStore } from '../modules/queue/interfaces/lock-store.interface';
import { RedisLockStore } from '../workers/scanner/infrastructure/lock/redis-lock.store';
import { ScanBatchProcessor } from '../workers/scanner/scanner.processor';
import { GithubClient } from '../modules/github/client/github.client';
import { CachedGithubClient } from '../modules/github/decorators/cached-github.decorator';
import { RabbitScanQueue } from '../modules/queue/adapters/rabbit-scan-queue';
import { ScanJobProducer } from '../modules/queue/queue.notifier';
import { cronScheduler } from '../modules/scheduler/adapters/cron.adapters';
import type { IJobQueue } from '../modules/scheduler/interfaces/scheduler.interfaces';
import { SchedulerService } from '../modules/scheduler/service/scheduler.service';
import { SmtpProvider } from '../modules/sender/mail.provider';
import { NotifierService } from '../modules/sender/services/mail.service';
import { GitHubRepoProviderAdapter } from '../modules/subscriptions/adapters/git-hub-provider.adapter';
import { SubscriptionRepository } from '../modules/subscriptions/repositories/subscription.repository';
import { SubscriptionService } from '../modules/subscriptions/services/subscription.service';
import { RedisCacheRepository } from '../modules/common/cache/cache.repository';
import { REDIS_CACHE_TTL_SECONDS } from '../modules/common/constants/api.constants';
import { MeteredScanBatchProcessor } from '../workers/scanner/infrastructure/decorators/scanner.processor.metered';
import type { IBatchProcessor } from '../workers/scanner/interfaces/scanner.interfaces';
import { MeteredNotifierService } from '../modules/sender/decorators/notifier.service.metered';
import type { IScanQueue } from '../modules/queue/interfaces/scan-queue.interface';

function createCachedGithubClient(): CachedGithubClient {
  return new CachedGithubClient(
    new GithubClient(config.github.token),
    new RedisCacheRepository(redis),
    REDIS_CACHE_TTL_SECONDS,
  );
}

function createNotifier(): MeteredNotifierService {
  return new MeteredNotifierService(new NotifierService(new SmtpProvider()));
}

export function createWorkerContainer(): {
  processor: IBatchProcessor;
  lockStore: ILockStore;
} {
  const githubClient = new GithubClient(config.github.token);
  const notifier = createNotifier();
  const lockStore = new RedisLockStore(redis);
  const subscriptionRepository = new SubscriptionRepository();

  const processor = new MeteredScanBatchProcessor(
    new ScanBatchProcessor({
      provider: new GithubReleaseAdapter(githubClient),
      notifier,
      repository: subscriptionRepository,
    }),
  );

  return { processor, lockStore };
}

export type ServerContainer = {
  subscriptionService: SubscriptionService;
  schedulerService: SchedulerService;
};

export function createServerContainer(): ServerContainer {
  const githubClient = createCachedGithubClient();
  const notifier = createNotifier();

  const subscriptionService = new SubscriptionService(
    new SubscriptionRepository(),
    new GitHubRepoProviderAdapter(githubClient),
    notifier,
    activeSubscriptionsGauge,
  );

  const lockStore = new RedisLockStore(redis);
  const queue: IScanQueue = new RabbitScanQueue();
  const jobQueue: IJobQueue = new ScanJobProducer(lockStore, queue);
  const schedulerService = new SchedulerService(subscriptionService, cronScheduler, jobQueue);

  return { subscriptionService, schedulerService };
}
