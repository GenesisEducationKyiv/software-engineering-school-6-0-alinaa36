/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ScannerService } from '../service/notifier.service';
import * as cron from 'node-cron';

vi.mock('../../../lib/logger/logger', () => ({
  Logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { Logger } from '../../../lib/logger/logger';
import { IScheduler, IJobQueue } from '../interfaces/notifier.interfaces';

// ---- helpers ----

function makeSubscriptionService(repos: Array<{ repository: string }> = []) {
  return {
    groupByRepository: vi.fn().mockResolvedValue(repos),
  };
}

function makeScheduler(): IScheduler & { getHandler: () => (() => Promise<void>) | undefined } {
  let capturedHandler: (() => Promise<void>) | undefined;
  return {
    schedule: vi.fn((_, handler) => {
      capturedHandler = handler;
      return { stop: vi.fn() } as unknown as cron.ScheduledTask;
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
  scheduler = makeScheduler(),
  jobQueue = makeJobQueue(),
) {
  const sub = makeSubscriptionService(repos);
  const service = new ScannerService(sub as any, scheduler, jobQueue);
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
    async function triggerCronCallback(scheduler: ReturnType<typeof makeScheduler>) {
      await scheduler.getHandler()?.();
    }

    it('не викликає addScanJobs якщо немає підписок', async () => {
      const { service, scheduler, jobQueue } = makeService([]);
      service.start();

      await triggerCronCallback(scheduler);

      expect(jobQueue.addScanJobs).not.toHaveBeenCalled();
    });

    it('логує що немає репозиторіїв якщо підписок немає', async () => {
      const { service, scheduler } = makeService([]);
      service.start();

      await triggerCronCallback(scheduler);

      expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('nothing'));
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
      const sub = { groupByRepository: vi.fn().mockRejectedValue(new Error('DB error')) };
      const scheduler = makeScheduler();
      const service = new ScannerService(sub as any, scheduler, makeJobQueue());
      service.start();

      await expect(triggerCronCallback(scheduler)).resolves.not.toThrow();
    });

    it('логує помилку якщо groupByRepository кинув виняток', async () => {
      const error = new Error('DB error');
      const sub = { groupByRepository: vi.fn().mockRejectedValue(error) };
      const scheduler = makeScheduler();
      const service = new ScannerService(sub as any, scheduler, makeJobQueue());
      service.start();

      await triggerCronCallback(scheduler);

      expect(Logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: error }),
        expect.any(String),
      );
    });

    it('не пробрасовує помилку якщо addScanJobs кинув виняток', async () => {
      const jobQueue: IJobQueue = {
        addScanJobs: vi.fn().mockRejectedValue(new Error('Queue unavailable')),
      };
      const scheduler = makeScheduler();
      const service = new ScannerService(
        makeSubscriptionService([{ repository: 'user/repo' }]) as any,
        scheduler,
        jobQueue,
      );
      service.start();

      await expect(triggerCronCallback(scheduler)).resolves.not.toThrow();
    });
  });
});
