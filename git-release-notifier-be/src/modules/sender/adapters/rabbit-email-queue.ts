import type { EmailMessage } from '@grn/contracts';
import { EMAIL_QUEUE_NAME } from '@grn/contracts';
import type { IEmailQueue } from '../interfaces/email-queue.interface';
import { getRabbitConnection } from '../../../lib/rabbit/rabbit.connection';

export class RabbitEmailQueue implements IEmailQueue {
  async publish(msg: EmailMessage): Promise<void> {
    const connection = await getRabbitConnection();
    const channel = await connection.createConfirmChannel();

    try {
      await channel.assertQueue(EMAIL_QUEUE_NAME, { durable: true });

      await new Promise<void>((resolve, reject) => {
        channel.sendToQueue(
          EMAIL_QUEUE_NAME,
          Buffer.from(JSON.stringify(msg)),
          { persistent: true },
          (err) => (err ? reject(err) : resolve()),
        );
      });
    } finally {
      await channel.close();
    }
  }
}
