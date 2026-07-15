import type { ChannelModel } from 'amqplib';
import amqp from 'amqplib';
import 'dotenv/config';
import { Logger } from '../logger/logger';
import { config } from '../config/env.config';

export const RECONNECT_DELAY_MS = 5_000;

const RABBIT_URL = config.rabbit.url;

let connectionPromise: Promise<ChannelModel> | null = null;

async function createRabbitConnection(): Promise<ChannelModel> {
  const connection = await amqp.connect(RABBIT_URL);
  Logger.info(' [RabbitMQ] Connection established.');

  connection.on('error', (err) => {
    Logger.error({ err }, '[RabbitMQ] Connection error');
    connectionPromise = null;
  });

  connection.on('close', () => {
    Logger.warn(
      { reconnectDelayMs: RECONNECT_DELAY_MS },
      '[RabbitMQ] Connection closed, reconnecting',
    );
    connectionPromise = null;
    scheduleReconnect();
  });

  return connection;
}

function scheduleReconnect(): void {
  setTimeout(() => {
    getRabbitConnection().catch((err) => {
      Logger.error({ err }, '[RabbitMQ] Reconnect failed, retrying');
      scheduleReconnect();
    });
  }, RECONNECT_DELAY_MS);
}

export async function getRabbitConnection(): Promise<ChannelModel> {
  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = createRabbitConnection();

  try {
    return await connectionPromise;
  } catch (err) {
    connectionPromise = null;
    throw err;
  }
}
