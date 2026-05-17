import { Logger } from '../../lib/logger/logger';
import { createChannel, QUEUE_NAME } from '../../lib/rabbit/rabbit.channel';
import { redis } from '../../lib/redis/redis';
import { WorkerConfig } from '../config/worker.config';
import type { ScanJobPayload } from './types/scanner.type';

function buildLockKey(batch: string[]): string {
  return `lock:scan:${Buffer.from(batch.join(',')).toString('base64')}`;
}

function calcDynamicTTL(batchSize: number): number {
  const processingTime =
    batchSize * WorkerConfig.MAX_TIME_PER_REPO_SEC +
    batchSize * 10 * WorkerConfig.MAX_TIME_PER_EMAIL_SEC;

  return processingTime + WorkerConfig.SAFETY_BUFFER_SEC;
}

export async function addScanJobs(repos: string[]): Promise<void> {
  const channel = await createChannel();

  try {
    for (let i = 0; i < repos.length; i += WorkerConfig.BATCH_SIZE) {
      const batch = repos.slice(i, i + WorkerConfig.BATCH_SIZE);
      const lockKey = buildLockKey(batch);

      const acquired = await redis.set(
        lockKey,
        'processing',
        'EX',
        calcDynamicTTL(batch.length),
        'NX',
      );

      if (!acquired) {
        Logger.info('[Redis] Batch is already in the queue. Skipping.');
        continue;
      }

      const payload: ScanJobPayload = { repos: batch, lockKey };
      const sent = channel.sendToQueue(QUEUE_NAME, Buffer.from(JSON.stringify(payload)), {
        persistent: true,
      });

      if (!sent) {
        Logger.warn(`[RabbitMQ] Queue buffer full, batch was not sent.`);
        await redis.del(lockKey);
        continue;
      }

      Logger.info(`[RabbitMQ] Batch of ${batch.length} repositories added to the queue.`);
    }
  } finally {
    await channel.close();
  }
}
