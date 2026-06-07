import type { ConsumeMessage } from 'amqplib';
import type { ScanJobPayload } from '../types/scanner.type';
import { type createChannel, QUEUE_NAME } from '../../../lib/rabbit/rabbit.channel';
import { WorkerConfig } from '../../config/worker.config';
import { Logger } from '../../../lib/logger/logger';

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
): Promise<void> {
  const retryCount = (msg.properties.headers?.['x-retry-count'] ?? 0) as number;

  if (retryCount >= WorkerConfig.MAX_RETRIES) {
    Logger.error(
      { retryCount, maxRetries: WorkerConfig.MAX_RETRIES },
      '[Worker] Retry limit exceeded, sending to DLQ',
    );
    channel.nack(msg, false, false);

    return;
  }

  await delay(WorkerConfig.NACK_RETRY_DELAY_MS);
  channel.nack(msg, false, false);
  channel.sendToQueue(QUEUE_NAME, msg.content, {
    persistent: true,
    headers: {
      ...msg.properties.headers,
      'x-retry-count': retryCount + 1,
    },
  });

  Logger.warn(
    { attempt: retryCount + 1, maxRetries: WorkerConfig.MAX_RETRIES },
    '[Worker] Retrying batch',
  );
}
