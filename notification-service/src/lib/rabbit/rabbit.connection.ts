import type { ChannelModel } from 'amqplib';
import amqp from 'amqplib';
import { Logger } from '../logger/logger';
import { config } from '../config/env.config';

let connectionPromise: Promise<ChannelModel> | null = null;
let closing = false;

async function connect(): Promise<ChannelModel> {
  const conn = await amqp.connect(config.rabbit.url);
  Logger.info('[RabbitMQ] Connection established.');

  conn.on('error', (err) => {
    Logger.error({ err }, '[RabbitMQ] Connection error');
    connectionPromise = null;
  });

  conn.on('close', () => {
    connectionPromise = null;
    if (!closing) {
      Logger.warn('[RabbitMQ] Connection closed');
    }
  });

  return conn;
}

export async function getRabbitConnection(): Promise<ChannelModel> {
  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = connect();

  try {
    return await connectionPromise;
  } catch (err) {
    connectionPromise = null;
    throw err;
  }
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