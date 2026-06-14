import { registerActiveSubscriptionsGauge } from '../../lib/metrics/metrics';
import { redis } from '../../lib/redis/redis';
import { prisma } from '../../lib/prisma';
import { REDIS_CACHE_TTL_SECONDS } from '../../modules/common/constants/api.constants';
import { RabbitScanQueue } from '../../modules/queue/adapters/rabbit-scan-queue';
import { ScanJobProducer } from '../../modules/queue/queue.notifier';
import type { IScanQueue } from '../../modules/queue/interfaces/scan-queue.interface';
import type { IJobQueue } from '../../modules/scheduler/interfaces/scheduler.interfaces';
import { cronScheduler } from '../../modules/scheduler/adapters/cron.adapters';
import { SchedulerService } from '../../modules/scheduler/service/scheduler.service';
import { RedisLockStore } from '../../modules/queue/adapters/redis-lock.store';
import { GitHubRepoProviderAdapter } from '../../modules/subscriptions/adapters/git-hub-provider.adapter';
import { SubscriptionRepository } from '../../modules/subscriptions/repositories/subscription.repository';
import { SubscriptionService } from '../../modules/subscriptions/services/subscription.service';
import { createCachedGithubClient, createNotifier } from '../factories';

export type ServerContainer = {
  subscriptionService: SubscriptionService;
  schedulerService: SchedulerService;
};

export function createServerContainer(): ServerContainer {
  const githubClient = createCachedGithubClient(REDIS_CACHE_TTL_SECONDS);
  const notifier = createNotifier();
  const subscriptionRepository = new SubscriptionRepository(prisma);

  const subscriptionService = new SubscriptionService(
    subscriptionRepository,
    new GitHubRepoProviderAdapter(githubClient),

    notifier,
  );

  const lockStore = new RedisLockStore(redis);
  const queue: IScanQueue = new RabbitScanQueue();
  const jobQueue: IJobQueue = new ScanJobProducer(lockStore, queue);
  const schedulerService = new SchedulerService(subscriptionRepository, cronScheduler, jobQueue);
  registerActiveSubscriptionsGauge(() => subscriptionRepository.countActive());

  return { subscriptionService, schedulerService };
}
