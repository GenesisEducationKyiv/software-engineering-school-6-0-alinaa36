import type { ConfirmChannel } from 'amqplib';
import { getRabbitConnection } from './rabbit.connection';

export const QUEUE_NAME = 'github-scanner-queue';
export const RETRY_QUEUE_NAME = 'github-scanner-retry-queue';

export async function createChannel(): Promise<ConfirmChannel> {
  const connection = await getRabbitConnection();
  const channel = await connection.createConfirmChannel();

  await channel.assertQueue(QUEUE_NAME, { durable: true });

  return channel;
}
