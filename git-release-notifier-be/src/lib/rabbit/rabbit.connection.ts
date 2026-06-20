import type { ChannelModel } from 'amqplib';
import amqp from 'amqplib';
import 'dotenv/config';
import { Logger } from '../logger/logger';
import { config } from '../config/env.config';

export const RECONNECT_DELAY_MS = 5_000;

const RABBIT_URL = config.rabbit.url;

let connection: ChannelModel | null = null;

export async function getRabbitConnection(): Promise<ChannelModel> {
  if (connection) {
    return connection;
  }

  connection = await amqp.connect(RABBIT_URL);
  Logger.info(' [RabbitMQ] Connection established.');

  connection.on('error', (err) => {
    Logger.error({ err }, '[RabbitMQ] Connection error');
    connection = null;
  });

  connection.on('close', () => {
    Logger.warn(
      { reconnectDelayMs: RECONNECT_DELAY_MS },
      '[RabbitMQ] Connection closed, reconnecting',
    );
    connection = null;
    setTimeout(getRabbitConnection, RECONNECT_DELAY_MS);
  });

  return connection;
}
