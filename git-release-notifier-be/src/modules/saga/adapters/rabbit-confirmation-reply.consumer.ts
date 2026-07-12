import type { ConsumeMessage } from 'amqplib';
import {
  SAGA_CONFIRMATION_REPLY_QUEUE,
  confirmationReplySchema,
  type ConfirmationReply,
} from '@grn/contracts';
import { getRabbitConnection } from '../../../lib/rabbit/rabbit.connection';
import { Logger } from '../../../lib/logger/logger';
import type { SubscribeSaga } from '../orchestrator/subscribe.saga';

function parseReply(msg: ConsumeMessage): ConfirmationReply | null {
  try {
    const parsed = JSON.parse(msg.content.toString()) as unknown;

    return confirmationReplySchema.parse(parsed);
  } catch (err) {
    Logger.warn({ err }, '[Saga] Invalid confirmation reply, discarding');

    return null;
  }
}

async function handleMessage(
  msg: ConsumeMessage,
  ack: () => void,
  nack: () => void,
  saga: SubscribeSaga,
): Promise<void> {
  const reply = parseReply(msg);

  if (!reply) {
    ack();

    return;
  }

  try {
    await saga.onReply(reply);
    ack();
    Logger.info(
      { sagaId: reply.sagaId, status: reply.status },
      '[Saga] Confirmation reply handled',
    );
  } catch (err) {
    Logger.error(
      { err, sagaId: reply.sagaId },
      '[Saga] Failed to handle confirmation reply, dropping (recovers on timeout sweep)',
    );
    nack();
  }
}

export async function startConfirmationReplyConsumer(saga: SubscribeSaga): Promise<void> {
  const connection = await getRabbitConnection();
  const channel = await connection.createChannel();

  await channel.assertQueue(SAGA_CONFIRMATION_REPLY_QUEUE, { durable: true });
  await channel.prefetch(20);

  void channel.consume(
    SAGA_CONFIRMATION_REPLY_QUEUE,
    (msg) => {
      if (!msg) return;

      const ack = () => {
        try {
          channel.ack(msg);
        } catch (err) {
          Logger.error({ err }, '[Saga] Failed to ack confirmation reply');
        }
      };
      const nack = () => {
        try {
          channel.nack(msg, false, false);
        } catch (err) {
          Logger.error({ err }, '[Saga] Failed to nack confirmation reply');
        }
      };

      void handleMessage(msg, ack, nack, saga).catch((err) => {
        Logger.error({ err }, '[Saga] Unhandled error in reply consumer');
        nack();
      });
    },
    { noAck: false },
  );

  Logger.info('[Saga] Confirmation reply consumer started, listening for replies...');
}
