import type { ChannelModel } from 'amqplib';
import amqp from 'amqplib';
import 'dotenv/config';
import { Logger } from '../logger/logger';
import { config } from '../config/env.config';

export const RECONNECT_DELAY_MS = 5_000;

const RABBIT_URL = config.rabbit.url;

let connectionPromise: Promise<ChannelModel> | null = null;
let closing = false;

async function connect(): Promise<ChannelModel> {
  const conn = await amqp.connect(RABBIT_URL);
  Logger.info('[RabbitMQ] Connection established.');

  conn.on('error', (err) => {
    Logger.error({ err }, '[RabbitMQ] Connection error');
  });

  conn.on('close', () => {
    connectionPromise = null;
    if (closing) return;

    Logger.warn(
      { reconnectDelayMs: RECONNECT_DELAY_MS },
      '[RabbitMQ] Connection closed, reconnecting',
    );
    setTimeout(() => {
      void getRabbitConnection().catch((err: unknown) => {
        Logger.error({ err }, '[RabbitMQ] Reconnect failed');
      });
    }, RECONNECT_DELAY_MS);
  });

  return conn;
}

export function getRabbitConnection(): Promise<ChannelModel> {
  if (!connectionPromise) {
    connectionPromise = connect().catch((err: unknown) => {
      connectionPromise = null;
      throw err;
    });
  }

  return connectionPromise;
}

export async function closeRabbitConnection(): Promise<void> {
  closing = true;

  if (!connectionPromise) {
    return;
  }

  const pending = connectionPromise;
  connectionPromise = null;

  try {
    const conn = await pending;
    await conn.close();
  } catch (err) {
    Logger.error({ err }, '[RabbitMQ] Error while closing connection');
  }
}
