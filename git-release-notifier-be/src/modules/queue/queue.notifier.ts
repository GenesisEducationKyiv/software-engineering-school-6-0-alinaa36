import { Logger } from '../../lib/logger/logger';
import { SCAN_BATCH_SIZE } from '../common/constants/api.constants';
import type { ILockStore } from './interfaces/lock-store.interface';
import type {
  IScanQueue,
  IScanQueueSession,
  ScanJobPayload,
} from './interfaces/scan-queue.interface';

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];

  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }

  return batches;
}

export class ScanJobProducer {
  constructor(
    private readonly lockStore: ILockStore,
    private readonly queue: IScanQueue,
  ) {}

  async addScanJobs(repos: string[]): Promise<void> {
    const session = await this.queue.open();
    try {
      for (const batch of chunk(repos, SCAN_BATCH_SIZE)) {
        await this.publishBatch(session, batch);
      }
    } finally {
      await session.close();
    }
  }

  private async publishBatch(session: IScanQueueSession, batch: string[]): Promise<void> {
    const { acquired, lockKey } = await this.lockStore.acquireForBatch(batch);
    if (!acquired) {
      Logger.debug('[Redis] Batch is already in the queue. Skipping.');

      return;
    }
    const payload: ScanJobPayload = { repos: batch, lockKey };
    if (!session.send(payload)) {
      Logger.warn('[Queue] Buffer full, batch was not sent.');
      await this.lockStore.unlock(lockKey);

      return;
    }
    Logger.info({ batchSize: batch.length }, '[Queue] Batch added to the queue');
  }
}
