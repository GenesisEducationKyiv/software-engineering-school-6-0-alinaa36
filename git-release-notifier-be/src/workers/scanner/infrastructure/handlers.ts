import type { ConsumeMessage } from 'amqplib';
import type { ScanJobPayload } from '../../../modules/queue/interfaces/scan-queue.interface';
import { type createChannel, RETRY_QUEUE_NAME } from '../../../lib/rabbit/rabbit.channel';
import { WorkerConfig } from '../../config/worker.config';
import { Logger } from '../../../lib/logger/logger';
import { workerRetriesTotal } from '../../../lib/metrics/metrics';

export function parsePayload(msg: ConsumeMessage): ScanJobPayload | null {
  try {
    return JSON.parse(msg.content.toString()) as ScanJobPayload;
  } catch (err) {
    Logger.warn({ err }, '[Worker] Failed to parse message payload');

    return null;
  }
}

export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function handleRetry(
  msg: ConsumeMessage,
  channel: Awaited<ReturnType<typeof createChannel>>,
): Promise<boolean> {
  const retryCount = (msg.properties.headers?.['x-retry-count'] ?? 0) as number;

  if (retryCount >= WorkerConfig.MAX_RETRIES) {
    Logger.error(
      { retryCount, maxRetries: WorkerConfig.MAX_RETRIES },
      '[Worker] Retry limit exceeded, discarding message',
    );
    channel.nack(msg, false, false);

    return true;
  }

  workerRetriesTotal.inc();

  try {
    await new Promise<void>((resolve, reject) => {
      channel.sendToQueue(
        RETRY_QUEUE_NAME,
        msg.content,
        {
          persistent: true,
          headers: {
            ...msg.properties.headers,
            'x-retry-count': retryCount + 1,
          },
        },
        (err) => (err ? reject(err) : resolve()),
      );
    });
  } catch (err) {
    Logger.error({ err }, '[Worker] Failed to publish retry message, requeueing');
    channel.nack(msg, false, true);

    return false;
  }

  channel.nack(msg, false, false);

  Logger.warn(
    { attempt: retryCount + 1, maxRetries: WorkerConfig.MAX_RETRIES },
    '[Worker] Retrying batch',
  );

  return false;
}
