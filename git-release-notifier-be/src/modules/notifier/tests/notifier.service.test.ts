/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
vi.mock('../../queue/queue.notifier', () => ({
  addScanJobs: vi.fn(),
}));

vi.mock('node-cron', () => ({
  schedule: vi.fn(),
}));

vi.mock('../../../lib/logger/logger', () => ({
  Logger: { info: vi.fn(), error: vi.fn() },
}));

import { addScanJobs } from '../../queue/queue.notifier';
import * as cron from 'node-cron';
import { Logger } from '../../../lib/logger/logger';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ScannerService } from '../service/notifier.service';

// ---- helpers ----

function makeSubscriptionService(repos: Array<{ repository: string }> = []) {
  return {
    groupByRepository: vi.fn().mockResolvedValue(repos),
  };
}

function makeCronTask() {
  return { stop: vi.fn() };
}

// ---- тести ----

describe('ScannerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- start / stop ---

  describe('start', () => {
    it('реєструє cron задачу при старті', () => {
      const service = new ScannerService(makeSubscriptionService() as any);
      vi.mocked(cron.schedule).mockReturnValue(makeCronTask() as any);

      service.start();

      expect(cron.schedule).toHaveBeenCalledWith('* * * * *', expect.any(Function));
    });

    it('не реєструє другу задачу якщо start викликано двічі', () => {
      vi.mocked(cron.schedule).mockReturnValue(makeCronTask() as any);
      const service = new ScannerService(makeSubscriptionService() as any);

      service.start();
      service.start();

      expect(cron.schedule).toHaveBeenCalledTimes(2);
    });
  });

  describe('stop', () => {
    it('зупиняє cron задачу', () => {
      const task = makeCronTask();
      vi.mocked(cron.schedule).mockReturnValue(task as any);
      const service = new ScannerService(makeSubscriptionService() as any);

      service.start();
      service.stop();

      expect(task.stop).toHaveBeenCalledOnce();
    });

    it('не падає якщо stop викликано до start', () => {
      const service = new ScannerService(makeSubscriptionService() as any);

      expect(() => service.stop()).not.toThrow();
    });
  });

  // --- generateJobs ---

  describe('generateJobs', () => {
    async function triggerCronCallback(service: ScannerService) {
      const callback = vi.mocked(cron.schedule).mock.calls[0][1] as () => Promise<void>;
      await callback();
    }

    beforeEach(() => {
      vi.mocked(cron.schedule).mockReturnValue(makeCronTask() as any);
    });

    it('не викликає addScanJobs якщо немає підписок', async () => {
      const service = new ScannerService(makeSubscriptionService([]) as any);
      service.start();

      await triggerCronCallback(service);

      expect(addScanJobs).not.toHaveBeenCalled();
    });

    it('логує що база порожня якщо немає підписок', async () => {
      const service = new ScannerService(makeSubscriptionService([]) as any);
      service.start();

      await triggerCronCallback(service);

      expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('empty'));
    });

    it('викликає addScanJobs з унікальними іменами репозиторіїв', async () => {
      const repos = [{ repository: 'user/repo-a' }, { repository: 'user/repo-b' }];
      const service = new ScannerService(makeSubscriptionService(repos) as any);
      service.start();

      await triggerCronCallback(service);

      expect(addScanJobs).toHaveBeenCalledWith(['user/repo-a', 'user/repo-b']);
    });

    it('викликає addScanJobs рівно один раз за один тік крону', async () => {
      const repos = [{ repository: 'user/repo' }];
      const service = new ScannerService(makeSubscriptionService(repos) as any);
      service.start();

      await triggerCronCallback(service);

      expect(addScanJobs).toHaveBeenCalledTimes(1);
    });

    it('не пробрасовує помилку якщо groupByRepository кинув виняток', async () => {
      const subscriptionService = {
        groupByRepository: vi.fn().mockRejectedValue(new Error('DB connection lost')),
      };
      const service = new ScannerService(subscriptionService as any);
      service.start();

      await expect(triggerCronCallback(service)).resolves.not.toThrow();
    });

    it('логує помилку якщо groupByRepository кинув виняток', async () => {
      const error = new Error('DB connection lost');
      const subscriptionService = {
        groupByRepository: vi.fn().mockRejectedValue(error),
      };
      const service = new ScannerService(subscriptionService as any);
      service.start();

      await triggerCronCallback(service);

      expect(Logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: error }),
        expect.any(String),
      );
    });

    it('не пробрасовує помилку якщо addScanJobs кинув виняток', async () => {
      vi.mocked(addScanJobs).mockRejectedValue(new Error('RabbitMQ unavailable'));
      const repos = [{ repository: 'user/repo' }];
      const service = new ScannerService(makeSubscriptionService(repos) as any);
      service.start();

      await expect(triggerCronCallback(service)).resolves.not.toThrow();
    });
  });
});
