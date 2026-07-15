import { SAGA_CONFIRMATION_REPLY_QUEUE, type ConfirmationReply } from '@grn/contracts';
import { getRabbitConnection } from '../../../lib/rabbit/rabbit.connection';
import type { IConfirmationReplyPublisher } from '../interfaces/confirmation-reply-publisher.interface';

export class RabbitConfirmationReplyPublisher implements IConfirmationReplyPublisher {
  async publish(reply: ConfirmationReply): Promise<void> {
    const connection = await getRabbitConnection();
    const channel = await connection.createConfirmChannel();

    try {
      await channel.assertQueue(SAGA_CONFIRMATION_REPLY_QUEUE, { durable: true });

      await new Promise<void>((resolve, reject) => {
        channel.sendToQueue(
          SAGA_CONFIRMATION_REPLY_QUEUE,
          Buffer.from(JSON.stringify(reply)),
          { persistent: true },
          (err) => (err ? reject(err) : resolve()),
        );
      });
    } finally {
      await channel.close();
    }
  }
}
