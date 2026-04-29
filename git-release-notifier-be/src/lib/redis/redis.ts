import { Redis } from 'ioredis';
import 'dotenv/config';
import { Logger } from '../logger/logger';
import { config } from '../config/env.config';

const REDIS_URL = config.redis.url;

if (!REDIS_URL) {
  throw new Error('REDIS_URL environment variable is not set');
}

export const redis = new Redis(REDIS_URL, {
  tls: REDIS_URL.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
  enableOfflineQueue: true,
  maxRetriesPerRequest: 3,
});

redis.on('error', (err) => {
  Logger.error({ err }, '[Redis] Connection error');
});

Logger.info('[Redis] Client initialized.');
