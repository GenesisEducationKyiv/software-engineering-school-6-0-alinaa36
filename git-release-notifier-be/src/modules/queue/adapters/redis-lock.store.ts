import { randomUUID } from 'crypto';
import type Redis from 'ioredis';
import { Logger } from '../../../lib/logger/logger';
import type { ILockStore } from '../interfaces/lock-store.interface';
import { LOCK_TTL } from '../constants/lock.constants';

const UNLOCK_IF_OWNER = `
  if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1])
  else
    return 0
  end
`;

export class RedisLockStore implements ILockStore {
  constructor(private readonly redis: Redis) {}

  async acquireForBatch(
    batch: string[],
  ): Promise<{ acquired: boolean; lockKey: string; token: string }> {
    const lockKey = this.buildLockKey(batch);
    const token = randomUUID();
    const acquired = await this.acquire(lockKey, token, this.calcDynamicTTL(batch.length));

    return { acquired, lockKey, token };
  }

  private async acquire(key: string, token: string, ttl: number): Promise<boolean> {
    const result = await this.redis.set(key, token, 'EX', ttl, 'NX');

    return result !== null;
  }

  async unlock(key: string, token: string): Promise<void> {
    const released = await this.redis.eval(UNLOCK_IF_OWNER, 1, key, token);

    if (released === 1) {
      Logger.debug({ lockKey: key }, '[Redis] Lock released');
    } else {
      Logger.debug({ lockKey: key }, '[Redis] Lock not released (not owner or expired)');
    }
  }

  private buildLockKey(batch: string[]): string {
    const stable = [...batch].sort().join(',');

    return `lock:scan:${Buffer.from(stable).toString('base64')}`;
  }

  private calcDynamicTTL(batchSize: number): number {
    const processingTime =
      batchSize * LOCK_TTL.MAX_TIME_PER_REPO_SEC +
      batchSize * LOCK_TTL.EXPECTED_EMAILS_PER_REPO * LOCK_TTL.MAX_TIME_PER_EMAIL_SEC;

    return processingTime + LOCK_TTL.SAFETY_BUFFER_SEC;
  }
}
