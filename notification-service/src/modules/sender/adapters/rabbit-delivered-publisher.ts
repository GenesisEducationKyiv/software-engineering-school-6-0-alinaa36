import { RELEASE_DELIVERED_QUEUE_NAME, type ReleaseDeliveredEvent } from '@grn/contracts';
import { getRabbitConnection } from '../../../lib/rabbit/rabbit.connection';
import type { IDeliveredPublisher } from '../interfaces/delivered-publisher.interface';

export class RabbitDeliveredPublisher implements IDeliveredPublisher {
  async publish(event: ReleaseDeliveredEvent): Promise<void> {
    const connection = await getRabbitConnection();
    const channel = await connection.createConfirmChannel();

    try {
      await channel.assertQueue(RELEASE_DELIVERED_QUEUE_NAME, { durable: true });

      await new Promise<void>((resolve, reject) => {
        channel.sendToQueue(
          RELEASE_DELIVERED_QUEUE_NAME,
          Buffer.from(JSON.stringify(event)),
          { persistent: true },
          (err) => (err ? reject(err) : resolve()),
        );
      });
    } finally {
      await channel.close();
    }
  }
}
