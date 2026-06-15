import { Redis } from 'ioredis';
import { Logger } from '../logger/logger';
import { config } from '../config/env.config';

export const redis = new Redis(config.redis.url, {
  tls: config.redis.url.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
  enableOfflineQueue: true,
  maxRetriesPerRequest: 3,
});

redis.on('error', (err) => {
  Logger.error({ err }, '[Redis] Connection error');
});

Logger.info('[Redis] Client initialized.');

export async function closeRedis(): Promise<void> {
  await redis.quit();
}
