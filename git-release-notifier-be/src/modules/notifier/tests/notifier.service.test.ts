import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ScannerService } from '../service/notifier.service';
import type {
  IScheduler,
  IJobQueue,
  IScheduledTask,
  ISubscriptionServiceForScanner,
} from '../interfaces/notifier.interfaces';

vi.mock('../../../lib/logger/logger', () => ({
  Logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

// ---- типи ----

type TestScheduler = IScheduler & { getHandler: () => (() => Promise<void>) | undefined };

// ---- helpers ----

function makeSubscriptionService(
  repos: Array<{ repository: string }> = [],
): ISubscriptionServiceForScanner {
  return {
    groupByRepository: vi.fn().mockResolvedValue(repos),
  };
}

function makeScheduler(): TestScheduler {
  let capturedHandler: (() => Promise<void>) | undefined;

  return {
    schedule: vi.fn((_, handler) => {
      capturedHandler = handler;

      return { stop: vi.fn(), start: vi.fn() } satisfies IScheduledTask;
    }),
    stop: vi.fn(),
    getHandler: () => capturedHandler,
  };
}

function makeJobQueue(): IJobQueue {
  return {
    addScanJobs: vi.fn().mockResolvedValue(undefined),
  };
}

function makeService(
  repos: Array<{ repository: string }> = [],
  scheduler: TestScheduler = makeScheduler(),
  jobQueue: IJobQueue = makeJobQueue(),
  subscriptionService?: ISubscriptionServiceForScanner,
) {
  const sub = subscriptionService ?? makeSubscriptionService(repos);
  const service = new ScannerService(sub, scheduler, jobQueue);

  return { service, sub, scheduler, jobQueue };
}

// ---- тести ----

describe('ScannerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('start', () => {
    it('реєструє cron задачу при старті', () => {
      const { service, scheduler } = makeService();

      service.start();

      expect(scheduler.schedule).toHaveBeenCalledWith('* * * * *', expect.any(Function));
    });

    it('не реєструє другу задачу якщо start викликано двічі', () => {
      const { service, scheduler } = makeService();

      service.start();
      service.start();

      expect(scheduler.schedule).toHaveBeenCalledTimes(1);
    });
  });

  describe('stop', () => {
    it('зупиняє cron задачу', () => {
      const { service, scheduler } = makeService();

      service.start();
      service.stop();

      expect(scheduler.stop).toHaveBeenCalledOnce();
    });

    it('не падає якщо stop викликано до start', () => {
      const { service } = makeService();

      expect(() => service.stop()).not.toThrow();
    });
  });

  describe('generateJobs', () => {
    async function triggerCronCallback(scheduler: TestScheduler) {
      await scheduler.getHandler()?.();
    }

    it('не викликає addScanJobs якщо немає підписок', async () => {
      const { service, scheduler, jobQueue } = makeService([]);
      service.start();

      await triggerCronCallback(scheduler);

      expect(jobQueue.addScanJobs).not.toHaveBeenCalled();
    });

    it('викликає addScanJobs з іменами репозиторіїв', async () => {
      const repos = [{ repository: 'user/repo-a' }, { repository: 'user/repo-b' }];
      const { service, scheduler, jobQueue } = makeService(repos);
      service.start();

      await triggerCronCallback(scheduler);

      expect(jobQueue.addScanJobs).toHaveBeenCalledWith(['user/repo-a', 'user/repo-b']);
    });

    it('викликає addScanJobs рівно один раз за один тік крону', async () => {
      const { service, scheduler, jobQueue } = makeService([{ repository: 'user/repo' }]);
      service.start();

      await triggerCronCallback(scheduler);

      expect(jobQueue.addScanJobs).toHaveBeenCalledTimes(1);
    });

    it('не пробрасовує помилку якщо groupByRepository кинув виняток', async () => {
      const failingSub: ISubscriptionServiceForScanner = {
        groupByRepository: vi.fn().mockRejectedValue(new Error('DB error')),
      };
      const scheduler = makeScheduler();
      const { service } = makeService([], scheduler, makeJobQueue(), failingSub);
      service.start();

      await expect(triggerCronCallback(scheduler)).resolves.not.toThrow();
    });

    it('не пробрасовує помилку якщо addScanJobs кинув виняток', async () => {
      const failingJobQueue: IJobQueue = {
        addScanJobs: vi.fn().mockRejectedValue(new Error('Queue unavailable')),
      };
      const scheduler = makeScheduler();
      const { service } = makeService([{ repository: 'user/repo' }], scheduler, failingJobQueue);
      service.start();

      await expect(triggerCronCallback(scheduler)).resolves.not.toThrow();
    });
  });
});
