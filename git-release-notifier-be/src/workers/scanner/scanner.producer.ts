import { Logger } from '../../lib/logger/logger';
import { createChannel, QUEUE_NAME } from '../../lib/rabbit/rabbit.channel';
import { redis } from '../../lib/redis/redis';
import { WorkerConfig } from '../config/worker.config';
import { ScanJobPayload } from './scanner.type';

function buildLockKey(batch: string[]): string {
  return `lock:scan:${Buffer.from(batch.join(',')).toString('base64')}`;
}

export async function addScanJobs(repos: string[]): Promise<void> {
  const channel = await createChannel();

  for (let i = 0; i < repos.length; i += WorkerConfig.BATCH_SIZE) {
    const batch = repos.slice(i, i + WorkerConfig.BATCH_SIZE);
    const lockKey = buildLockKey(batch);

    const expectedProcessingTime =
      batch.length * WorkerConfig.MAX_TIME_PER_REPO_SEC +
      batch.length * 10 * WorkerConfig.MAX_TIME_PER_EMAIL_SEC;
    const dynamicTTL = expectedProcessingTime + WorkerConfig.SAFETY_BUFFER_SEC;

    const acquired = await redis.set(lockKey, 'processing', 'EX', dynamicTTL, 'NX');

    if (!acquired) {
      Logger.info('[Redis] Batch is already in the queue. Skipping.');
      continue;
    }

    const payload: ScanJobPayload = { repos: batch, lockKey };
    const messageBuffer = Buffer.from(JSON.stringify(payload));

    channel.sendToQueue(QUEUE_NAME, messageBuffer, { persistent: true });

    Logger.info(`[RabbitMQ] Batch of ${batch.length} repositories added to the queue.`);
  }

  await channel.close();
}
