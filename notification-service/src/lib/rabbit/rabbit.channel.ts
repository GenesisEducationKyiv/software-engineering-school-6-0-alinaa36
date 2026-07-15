import type { Channel } from 'amqplib';
import { getRabbitConnection } from './rabbit.connection';
import { EMAIL_QUEUE_NAME } from '@grn/contracts';

export async function createChannel(): Promise<Channel> {
  const connection = await getRabbitConnection();
  const channel = await connection.createChannel();

  await channel.assertQueue(EMAIL_QUEUE_NAME, { durable: true });

  return channel;
}
