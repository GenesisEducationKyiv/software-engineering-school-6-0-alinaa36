import { Logger } from '../../../lib/logger/logger';
import type {
  IScheduledTask,
  IScheduler,
} from '../../scheduler/interfaces/scheduler.interfaces';
import type { SubscribeSaga } from '../orchestrator/subscribe.saga';

const TIMEOUT_SWEEP_CRON = '* * * * *';

export class SagaTimeoutScheduler {
  private task: IScheduledTask | null = null;

  constructor(
    private readonly scheduler: IScheduler,
    private readonly saga: SubscribeSaga,
    private readonly timeoutMs: number,
  ) {}

  start(): void {
    if (this.task) {
      Logger.warn('[Saga] Timeout scheduler already running, ignoring start().');

      return;
    }

    this.task = this.scheduler.schedule(TIMEOUT_SWEEP_CRON, async () => {
      try {
        await this.saga.compensateStuck(this.timeoutMs);
      } catch (err) {
        Logger.error({ err }, '[Saga] Timeout sweep failed');
      }
    });

    Logger.info('[Saga] Timeout scheduler started.');
  }

  stop(): void {
    if (!this.task) return;
    this.task.stop();
    this.task = null;
    Logger.info('[Saga] Timeout scheduler stopped.');
  }
}
