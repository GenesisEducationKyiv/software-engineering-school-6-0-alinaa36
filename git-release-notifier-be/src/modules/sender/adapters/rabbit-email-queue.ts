import type { ConfirmChannel } from 'amqplib';
import type { EmailMessage } from '@grn/contracts';
import { EMAIL_QUEUE_NAME } from '@grn/contracts';
import type { IEmailQueue } from '../interfaces/email-queue.interface';
import { getRabbitConnection } from '../../../lib/rabbit/rabbit.connection';

export class RabbitEmailQueue implements IEmailQueue {
  private channelPromise: Promise<ConfirmChannel> | null = null;

  async publish(msg: EmailMessage): Promise<void> {
    const channel = await this.getChannel();

    await new Promise<void>((resolve, reject) => {
      channel.sendToQueue(
        EMAIL_QUEUE_NAME,
        Buffer.from(JSON.stringify(msg)),
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
    await channel.assertQueue(EMAIL_QUEUE_NAME, { durable: true });

    channel.on('error', () => {
      this.channelPromise = null;
    });
    channel.on('close', () => {
      this.channelPromise = null;
    });

    return channel;
  }
}