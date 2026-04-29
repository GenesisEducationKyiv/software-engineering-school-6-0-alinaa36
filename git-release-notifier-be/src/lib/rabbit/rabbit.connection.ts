import amqp, { ChannelModel } from 'amqplib';
import 'dotenv/config';
import { Logger } from '../logger/logger';
import { config } from '../config/env.config';
import { RECONNECT_DELAY_MS } from '../../modules/common/constants/api.constants';

const RABBIT_URL = config.rabbit.url;

let connection: ChannelModel | null = null;

export async function getRabbitConnection(): Promise<ChannelModel> {
  if (connection) return connection;

  connection = await amqp.connect(RABBIT_URL);
  Logger.info(' [RabbitMQ] Connection established.');

  connection.on('error', (err) => {
    Logger.error({ err }, '[RabbitMQ] Connection error');
    connection = null;
  });

  connection.on('close', () => {
    Logger.warn(`[RabbitMQ] Connection closed. Reconnecting in ${RECONNECT_DELAY_MS} ms...`);
    connection = null;
    setTimeout(getRabbitConnection, RECONNECT_DELAY_MS);
  });

  return connection;
}
