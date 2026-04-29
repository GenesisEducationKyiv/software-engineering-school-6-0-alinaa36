import { addScanJobs } from '../../queue/queue.notifier';
import * as cron from 'node-cron';
import { SubscriptionService } from '../../subscriptions/services/subscription.service';
import { Logger } from '../../../lib/logger/logger';

export class ScannerService {
  private cronTask: cron.ScheduledTask | null = null;

  constructor(private readonly subscriptionService: SubscriptionService) {}

  start() {
    this.cronTask = cron.schedule('* * * * *', async () => {
      Logger.info('[Cron] Starting job generation...');
      await this.generateJobs();
    });
  }

  stop() {
    if (this.cronTask) {
      this.cronTask.stop();
      Logger.info('[Cron] Scheduler stopped successfully.');
    }
  }

  private async generateJobs() {
    try {
      const uniqueRepos = await this.subscriptionService.groupByRepository();
      if (uniqueRepos.length === 0) {
        Logger.info('[Cron] Database is empty, nothing to scan.');
        return;
      }

      const repoNames = uniqueRepos.map((repo) => repo.repository);

      await addScanJobs(repoNames);
    } catch (error) {
      Logger.error({ err: error }, '[Cron] Error generating jobs');
    }
  }
}
