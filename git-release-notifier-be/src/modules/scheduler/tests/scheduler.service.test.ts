import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mocked } from 'vitest';

vi.mock('../../../lib/logger/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { SchedulerService } from '../service/scheduler.service';
import type {
  IScheduler,
  IScheduledTask,
  IJobQueue,
  IRepositorySource,
} from '../interfaces/scheduler.interfaces';

// ---- типи ----

type TestScheduler = IScheduler & {
  getHandler(): (() => Promise<void>) | undefined;
};

// ---- helpers ----

function makeRepositorySource(repos: { repository: string }[] = []): Mocked<IRepositorySource> {
  return {
    groupByRepository: vi.fn().mockResolvedValue(repos),
  };
}

function makeJobQueue(): Mocked<IJobQueue> {
  return {
    addScanJobs: vi.fn().mockResolvedValue(undefined),
  };
}

function makeScheduler(): { scheduler: TestScheduler; task: Mocked<IScheduledTask> } {
  const task: Mocked<IScheduledTask> = { stop: vi.fn() };
  let capturedHandler: (() => Promise<void>) | undefined;

  const scheduler: TestScheduler = {
    schedule: vi.fn((_expression, handler) => {
      capturedHandler = handler as () => Promise<void>;

      return task;
    }),
    getHandler: () => capturedHandler,
  };

  return { scheduler, task };
}

function makeService(options: { repos?: { repository: string }[] } = {}) {
  const { scheduler, task } = makeScheduler();
  const repositorySource = makeRepositorySource(options.repos ?? []);
  const jobQueue = makeJobQueue();
  const service = new SchedulerService(repositorySource, scheduler, jobQueue);

  return { service, scheduler, task, repositorySource, jobQueue };
}

async function triggerCron(scheduler: TestScheduler): Promise<void> {
  await scheduler.getHandler()?.();
}

// ---- тести ----

describe('SchedulerService', () => {
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
      const { service, task } = makeService();

      service.start();
      service.stop();

      expect(task.stop).toHaveBeenCalledOnce();
    });

    it('не падає якщо stop викликано до start', () => {
      const { service } = makeService();

      expect(() => service.stop()).not.toThrow();
    });
  });

  describe('generateJobs', () => {
    it('не викликає addScanJobs якщо немає підписок', async () => {
      const { service, scheduler, jobQueue } = makeService({ repos: [] });
      service.start();

      await triggerCron(scheduler);

      expect(jobQueue.addScanJobs).not.toHaveBeenCalled();
    });

    it('викликає addScanJobs з іменами репозиторіїв', async () => {
      const repos = [{ repository: 'user/repo-a' }, { repository: 'user/repo-b' }];
      const { service, scheduler, jobQueue } = makeService({ repos });
      service.start();

      await triggerCron(scheduler);

      expect(jobQueue.addScanJobs).toHaveBeenCalledWith(['user/repo-a', 'user/repo-b']);
    });

    it('викликає addScanJobs рівно один раз за один тік крону', async () => {
      const { service, scheduler, jobQueue } = makeService({
        repos: [{ repository: 'user/repo' }],
      });
      service.start();

      await triggerCron(scheduler);

      expect(jobQueue.addScanJobs).toHaveBeenCalledTimes(1);
    });

    it('не пробрасовує помилку якщо groupByRepository кинув виняток', async () => {
      const { service, scheduler, repositorySource } = makeService();
      repositorySource.groupByRepository.mockRejectedValue(new Error('DB error'));
      service.start();

      await expect(triggerCron(scheduler)).resolves.not.toThrow();
    });

    it('не пробрасовує помилку якщо addScanJobs кинув виняток', async () => {
      const { service, scheduler, jobQueue } = makeService({
        repos: [{ repository: 'user/repo' }],
      });
      jobQueue.addScanJobs.mockRejectedValue(new Error('Queue unavailable'));
      service.start();

      await expect(triggerCron(scheduler)).resolves.not.toThrow();
    });
  });
});
