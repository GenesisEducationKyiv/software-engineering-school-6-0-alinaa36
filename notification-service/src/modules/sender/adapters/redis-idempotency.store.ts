import type { Redis } from 'ioredis';
import type { ClaimResult, IIdempotencyStore } from '../interfaces/idempotency-store.interface';

const KEY_PREFIX = 'notif:idemp:';
const PENDING = 'pending';
const DONE = 'done';

export class RedisIdempotencyStore implements IIdempotencyStore {
  constructor(
    private readonly redis: Redis,
    private readonly doneTtlSeconds: number,
    private readonly leaseSeconds: number,
  ) {}

  async claim(key: string): Promise<ClaimResult> {
    const namespaced = this.namespaced(key);
    const result = await this.redis.set(namespaced, PENDING, 'EX', this.leaseSeconds, 'NX');

    if (result === 'OK') {
      return 'claimed';
    }

    const current = await this.redis.get(namespaced);

    return current === DONE ? 'done' : 'in_progress';
  }

  async confirm(key: string): Promise<void> {
    await this.redis.set(this.namespaced(key), DONE, 'EX', this.doneTtlSeconds);
  }

  async release(key: string): Promise<void> {
    await this.redis.del(this.namespaced(key));
  }

  private namespaced(key: string): string {
    return `${KEY_PREFIX}${key}`;
  }
}
