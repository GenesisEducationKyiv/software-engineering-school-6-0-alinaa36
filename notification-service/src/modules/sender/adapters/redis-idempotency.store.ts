import type { Redis } from 'ioredis';
import type { IIdempotencyStore } from '../interfaces/idempotency-store.interface';

const KEY_PREFIX = 'notif:idemp:';

export class RedisIdempotencyStore implements IIdempotencyStore {
  constructor(
    private readonly redis: Redis,
    private readonly ttlSeconds: number,
  ) {}

  async markIfFirst(key: string): Promise<boolean> {
    const result = await this.redis.set(this.namespaced(key), '1', 'EX', this.ttlSeconds, 'NX');

    return result === 'OK';
  }

  async release(key: string): Promise<void> {
    await this.redis.del(this.namespaced(key));
  }

  private namespaced(key: string): string {
    return `${KEY_PREFIX}${key}`;
  }
}
