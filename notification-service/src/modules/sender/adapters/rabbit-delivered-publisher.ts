import type { ConfirmChannel } from 'amqplib';
import { RELEASE_DELIVERED_QUEUE_NAME, type ReleaseDeliveredEvent } from '@grn/contracts';
import { getRabbitConnection } from '../../../lib/rabbit/rabbit.connection';
import type { IDeliveredPublisher } from '../interfaces/delivered-publisher.interface';

export class RabbitDeliveredPublisher implements IDeliveredPublisher {
  private channelPromise: Promise<ConfirmChannel> | null = null;

  async publish(event: ReleaseDeliveredEvent): Promise<void> {
    const channel = await this.getChannel();

    await new Promise<void>((resolve, reject) => {
      channel.sendToQueue(
        RELEASE_DELIVERED_QUEUE_NAME,
        Buffer.from(JSON.stringify(event)),
        { persistent: true },
        (err) => (err ? reject(err) : resolve()),
      );
    });
  }

  private async getChannel(): Promise<ConfirmChannel> {
    if (this.channelPromise) {
      return this.channelPromise;
    }

    this.channelPromise = this.createChannel();

    try {
      return await this.channelPromise;
    } catch (err) {
      this.channelPromise = null;
      throw err;
    }
  }

  private async createChannel(): Promise<ConfirmChannel> {
    const connection = await getRabbitConnection();
    const channel = await connection.createConfirmChannel();
    await channel.assertQueue(RELEASE_DELIVERED_QUEUE_NAME, { durable: true });

    channel.on('error', () => {
      this.channelPromise = null;
    });
    channel.on('close', () => {
      this.channelPromise = null;
    });

    return channel;
  }
}
