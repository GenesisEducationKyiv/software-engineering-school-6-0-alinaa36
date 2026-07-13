import type Redis from 'ioredis/built/Redis';
import { Logger } from '../../../lib/logger/logger';
import type { ICacheRepository } from './cache-repository.interface';

export class RedisCacheRepository implements ICacheRepository {
  constructor(private readonly redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(key);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as T;
    } catch {
      Logger.error(
        `[Redis] Failed to parse cached value for key "${key}". Treating as cache miss.`,
      );

      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }
}
