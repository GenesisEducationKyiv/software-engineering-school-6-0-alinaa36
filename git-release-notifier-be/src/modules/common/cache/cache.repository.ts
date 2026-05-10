import { redis } from '../../../lib/redis/redis';
import { ICacheRepository } from './cache-repository.interface';

export class RedisCacheRepository implements ICacheRepository {
  async get<T>(key: string): Promise<T | null> {
    const raw = await redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }
}
