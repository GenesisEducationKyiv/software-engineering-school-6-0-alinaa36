import { config } from '../../../lib/config/env.config';
import { redis } from '../../../lib/redis/redis';
import { activeSubscriptionsGauge } from '../../../lib/metrics/metrics';
import { GithubReleaseAdapter } from '../../../workers/scanner/infrastructure/adapters/github-release-source-provider.adapter';
import type { ILockStore } from '../../../workers/scanner/infrastructure/lock/lock-store.interface';
import { RedisLockStore } from '../../../workers/scanner/infrastructure/lock/redis-lock.store';
import { ScanBatchProcessor } from '../../../workers/scanner/scanner.processor';
import { GithubClient } from '../../github/client/github.client';
import { CachedGithubClient } from '../../github/decorators/cached-github.decorator';
import { RabbitScanQueue } from '../../queue/adapters/rabbit-scan-queue';
import type { IScanQueue } from '../../queue/interfaces/scan-queue.interface';
import { addScanJobs } from '../../queue/queue.notifier';
import { cronScheduler } from '../../scheduler/adapters/cron.adapters';
import type { IJobQueue, IRepositorySource } from '../../scheduler/interfaces/scheduler.interfaces';
import { SchedulerService } from '../../scheduler/service/scheduler.service';
import { SmtpProvider } from '../../sender/mail.provider';
import { NotifierService } from '../../sender/services/mail.service';
import { GitHubRepoProviderAdapter } from '../../subscriptions/adapters/git-hub-provider.adapter';
import { SubscriptionRepository } from '../../subscriptions/repositories/subscription.repository';
import { SubscriptionService } from '../../subscriptions/services/subscription.service';
import { RedisCacheRepository } from '../cache/cache.repository';

function createCachedGithubClient(): CachedGithubClient {
  return new CachedGithubClient(
    new GithubClient(config.github.token),
    new RedisCacheRepository(redis),
  );
}

function createNotifier(): NotifierService {
  return new NotifierService(new SmtpProvider());
}

export function createWorkerContainer(): {
  processor: ScanBatchProcessor;
  lockStore: ILockStore;
} {
  const githubClient = createCachedGithubClient();
  const notifier = createNotifier();
  const lockStore = new RedisLockStore(redis);
  const subscriptionRepository = new SubscriptionRepository();

  const processor = new ScanBatchProcessor({
    provider: new GithubReleaseAdapter(githubClient),
    notifier,
    repository: subscriptionRepository,
  });

  return { processor, lockStore };
}

export type ServerContainer = {
  subscriptionService: SubscriptionService;
};

export function createServerContainer(): ServerContainer {
  const githubClient = createCachedGithubClient();
  const notifier = createNotifier();
  const repoProvider = new GitHubRepoProviderAdapter(githubClient);

  const subscriptionService = new SubscriptionService(
    new SubscriptionRepository(),
    repoProvider,
    notifier,
    activeSubscriptionsGauge,
  );

  return { subscriptionService };
}

export function createSchedulerService(repositorySource: IRepositorySource): SchedulerService {
  const lockStore = new RedisLockStore(redis);
  const queue: IScanQueue = new RabbitScanQueue();
  const jobQueue: IJobQueue = {
    addScanJobs: (repos) => addScanJobs(repos, lockStore, queue),
  };

  return new SchedulerService(repositorySource, cronScheduler, jobQueue);
}
