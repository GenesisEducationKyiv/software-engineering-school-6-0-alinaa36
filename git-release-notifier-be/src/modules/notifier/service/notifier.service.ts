import { Logger } from '../../../lib/logger/logger';
import type {
  IJobQueue,
  IScheduledTask,
  IScheduler,
  ISubscriptionServiceForScanner,
} from '../interfaces/notifier.interfaces';

const SCAN_CRON_EXPRESSION = '* * * * *';

export class ScannerService {
  private cronTask: IScheduledTask | null = null;

  constructor(
    private readonly subscriptionService: ISubscriptionServiceForScanner,
    private readonly scheduler: IScheduler,
    private readonly jobQueue: IJobQueue,
  ) {}

  start(): void {
    if (this.cronTask) {
      Logger.warn('[Cron] Already running, ignoring start().');

      return;
    }

    this.cronTask = this.scheduler.schedule(SCAN_CRON_EXPRESSION, async () => {
      try {
        await this.generateJobs();
      } catch (error) {
        Logger.error({ err: error }, '[Cron] Failed to generate jobs');
      }
    });

    Logger.info('[Cron] Scheduler started.');
  }

  stop(): void {
    if (!this.cronTask) return;

    this.scheduler.stop(this.cronTask);
    this.cronTask = null;
    Logger.info('[Cron] Scheduler stopped.');
  }

  private async generateJobs(): Promise<void> {
    const repos = await this.subscriptionService.groupByRepository();

    if (repos.length === 0) {
      Logger.info('[Cron] No repositories found, nothing to scan.');

      return;
    }

    await this.jobQueue.addScanJobs(repos.map((r) => r.repository));
  }
}
