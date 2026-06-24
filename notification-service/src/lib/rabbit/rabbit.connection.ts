import type { ChannelModel } from 'amqplib';
import amqp from 'amqplib';
import { Logger } from '../logger/logger';
import { config } from '../config/env.config';

let connection: ChannelModel | null = null;
let closing = false;

export async function getRabbitConnection(): Promise<ChannelModel> {
  if (connection) {
    return connection;
  }

  const conn = await amqp.connect(config.rabbit.url);
  Logger.info('[RabbitMQ] Connection established.');

  conn.on('error', (err) => {
    Logger.error({ err }, '[RabbitMQ] Connection error');
    connection = null;
  });

  conn.on('close', () => {
    connection = null;
    if (!closing) {
      Logger.warn('[RabbitMQ] Connection closed');
    }
  });

  connection = conn;

  return connection;
}

export async function closeRabbitConnection(): Promise<void> {
  closing = true;

  if (connection) {
    await connection.close();
    connection = null;
  }
}
