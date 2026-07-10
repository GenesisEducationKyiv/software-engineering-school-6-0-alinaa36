import type Redis from 'ioredis';
import { Logger } from '../../../../lib/logger/logger';
import type { ILockStore } from './lock-store.interface';
import { WorkerConfig } from '../../../config/worker.config';

export class RedisLockStore implements ILockStore {
  constructor(private readonly redis: Redis) {}

  async acquireForBatch(batch: string[]): Promise<{ acquired: boolean; lockKey: string }> {
    const lockKey = this.buildLockKey(batch);
    const acquired = await this.acquire(lockKey, this.calcDynamicTTL(batch.length));

    return { acquired, lockKey };
  }

  private async acquire(key: string, ttl: number): Promise<boolean> {
    const result = await this.redis.set(key, 'processing', 'EX', ttl, 'NX');

    return result !== null;
  }

  async unlock(key: string): Promise<void> {
    await this.redis.del(key);
    Logger.debug({ lockKey: key }, '[Redis] Lock released');
  }

  private buildLockKey(batch: string[]): string {
    const canonical = [...batch].sort().join(',');

    return `lock:scan:${Buffer.from(canonical).toString('base64')}`;
  }

  private calcDynamicTTL(batchSize: number): number {
    const processingTime =
      batchSize * WorkerConfig.MAX_TIME_PER_REPO_SEC +
      batchSize * 10 * WorkerConfig.MAX_TIME_PER_EMAIL_SEC;

    return processingTime + WorkerConfig.SAFETY_BUFFER_SEC;
  }
}
