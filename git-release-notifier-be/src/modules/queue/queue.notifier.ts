import { Logger } from '../../lib/logger/logger';
import { WorkerConfig } from '../../workers/config/worker.config';
import type { ILockStore } from '../../workers/scanner/infrastructure/lock/lock-store.interface';
import type { ScanJobPayload } from '../../workers/scanner/types/scanner.type';
import type { IScanQueue, IScanQueueSession } from './interfaces/scan-queue.interface';

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];

  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }

  return batches;
}

async function publishBatch(
  session: IScanQueueSession,
  batch: string[],
  lockStore: ILockStore,
): Promise<void> {
  const { acquired, lockKey } = await lockStore.acquireForBatch(batch);

  if (!acquired) {
    Logger.info('[Redis] Batch is already in the queue. Skipping.');

    return;
  }

  const payload: ScanJobPayload = { repos: batch, lockKey };
  const sent = session.send(payload);

  if (!sent) {
    Logger.warn(`[Queue] Buffer full, batch was not sent.`);
    await lockStore.unlock(lockKey);

    return;
  }

  Logger.info(`[Queue] Batch of ${batch.length} repositories added to the queue.`);
}

export async function addScanJobs(
  repos: string[],
  lockStore: ILockStore,
  queue: IScanQueue,
): Promise<void> {
  const session = await queue.open();

  try {
    for (const batch of chunk(repos, WorkerConfig.BATCH_SIZE)) {
      await publishBatch(session, batch, lockStore);
    }
  } finally {
    await session.close();
  }
}
