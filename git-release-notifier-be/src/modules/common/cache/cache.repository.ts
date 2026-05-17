import { redis } from '../../../lib/redis/redis';
import { Logger } from '../../../lib/logger/logger';
import type { ICacheRepository } from './cache-repository.interface';

export class RedisCacheRepository implements ICacheRepository {
  async get<T>(key: string): Promise<T | null> {
    const raw = await redis.get(key);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as T;
    } catch {
      Logger.warn(`[Redis] Failed to parse cached value for key "${key}". Treating as cache miss.`);

      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }
}
