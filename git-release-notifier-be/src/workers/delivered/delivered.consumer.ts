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

      void handleMessage(
        msg,
        () => channel.ack(msg),
        () => channel.nack(msg, false, false),
        repository,
      ).catch((err) => {
        Logger.error({ err }, '[Delivered] Unhandled error in consumer');
        try {
          channel.nack(msg, false, false);
        } catch (nackErr) {
          Logger.error({ err: nackErr }, '[Delivered] Failed to nack during fallback');
        }
      });
    },
    { noAck: false },
  );

  Logger.info('[Delivered] Consumer started, listening for delivery confirmations...');
}
