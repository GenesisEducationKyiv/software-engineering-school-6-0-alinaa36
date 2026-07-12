import type { ConsumeMessage } from 'amqplib';
import {
  RELEASE_DELIVERED_QUEUE_NAME,
  releaseDeliveredSchema,
  type ReleaseDeliveredEvent,
} from '@grn/contracts';
import { getRabbitConnection } from '../../lib/rabbit/rabbit.connection';
import { Logger } from '../../lib/logger/logger';
import type { ISubscriptionTagRepository } from '../../modules/subscriptions/interfaces/subscription-repository.interface';

function parseEvent(msg: ConsumeMessage): ReleaseDeliveredEvent | null {
  try {
    const parsed = JSON.parse(msg.content.toString()) as unknown;

    return releaseDeliveredSchema.parse(parsed);
  } catch (err) {
    Logger.warn({ err }, '[Delivered] Invalid release-delivered event, discarding');

    return null;
  }
}

async function handleMessage(
  msg: ConsumeMessage,
  ack: () => void,
  nack: () => void,
  repository: ISubscriptionTagRepository,
): Promise<void> {
  const event = parseEvent(msg);

  if (!event) {
    ack();

    return;
  }

  try {
    await repository.advanceTag(event.email, event.repo, event.tag);
    ack();
    Logger.info({ repo: event.repo, tag: event.tag }, '[Delivered] lastSeenTag advanced');
  } catch (err) {
    Logger.error(
      { err, repo: event.repo, tag: event.tag },
      '[Delivered] Failed to advance tag, dropping (recovers on next scan)',
    );
    nack();
  }
}

export async function startDeliveredConsumer(
  repository: ISubscriptionTagRepository,
): Promise<void> {
  const connection = await getRabbitConnection();
  const channel = await connection.createChannel();

  await channel.assertQueue(RELEASE_DELIVERED_QUEUE_NAME, { durable: true });
  await channel.prefetch(20);

  void channel.consume(
    RELEASE_DELIVERED_QUEUE_NAME,
    (msg) => {
      if (!msg) return;

      const ack = () => {
        try {
          channel.ack(msg);
        } catch (err) {
          Logger.error({ err }, '[Delivered] Failed to ack event');
        }
      };
      const nack = () => {
        try {
          channel.nack(msg, false, false);
        } catch (err) {
          Logger.error({ err }, '[Delivered] Failed to nack event');
        }
      };

      void handleMessage(msg, ack, nack, repository).catch((err) => {
        Logger.error({ err }, '[Delivered] Unhandled error in consumer');
        nack();
      });
    },
    { noAck: false },
  );

  Logger.info('[Delivered] Consumer started, listening for delivery confirmations...');
}
