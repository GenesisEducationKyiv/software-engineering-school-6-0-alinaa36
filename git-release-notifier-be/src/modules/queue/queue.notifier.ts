import { Logger } from '../../lib/logger/logger';
import { createChannel, QUEUE_NAME } from '../../lib/rabbit/rabbit.channel';
import { redis } from '../../lib/redis/redis';
import { WorkerConfig } from '../../workers/config/worker.config';
import type { ScanJobPayload } from '../../workers/scanner/scanner.type';

function buildLockKey(batch: string[]): string {
  return `lock:scan:${Buffer.from(batch.join(',')).toString('base64')}`;
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
        WorkerConfig.LOCK_TTL_SECONDS,
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
        continue;
      }

      Logger.info(`[RabbitMQ] Batch of ${batch.length} repositories added to the queue.`);
    }
  } finally {
    await channel.close();
  }
}
