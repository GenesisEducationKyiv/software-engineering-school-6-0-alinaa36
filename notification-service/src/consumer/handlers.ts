import type { Channel, ConsumeMessage } from 'amqplib';
import { Logger } from '../lib/logger/logger';
import { ConsumerConfig } from './email.consumer.config';
import { EMAIL_RETRY_QUEUE_NAME, EMAIL_DEAD_QUEUE_NAME } from '@grn/contracts';

export function deadLetterInvalid(msg: ConsumeMessage, channel: Channel): void {
  channel.sendToQueue(EMAIL_DEAD_QUEUE_NAME, msg.content, {
    persistent: true,
    headers: { ...msg.properties.headers, 'x-dead-reason': 'invalid-schema' },
  });
  Logger.warn('[Consumer] Invalid message moved to dead-letter queue');
}

export function handleRetry(msg: ConsumeMessage, channel: Channel): boolean {
  const retryCount = (msg.properties.headers?.['x-retry-count'] ?? 0) as number;

  if (retryCount >= ConsumerConfig.MAX_RETRIES) {
    channel.sendToQueue(EMAIL_DEAD_QUEUE_NAME, msg.content, {
      persistent: true,
      headers: { ...msg.properties.headers },
    });
    channel.nack(msg, false, false);
    Logger.error({ retryCount }, '[Consumer] Retry limit exceeded, moved to dead-letter queue');

    return true;
  }

  channel.sendToQueue(EMAIL_RETRY_QUEUE_NAME, msg.content, {
    persistent: true,
    headers: { ...msg.properties.headers, 'x-retry-count': retryCount + 1 },
  });
  channel.nack(msg, false, false);
  Logger.warn({ attempt: retryCount + 1 }, '[Consumer] Retrying email delivery');

  return false;
}
