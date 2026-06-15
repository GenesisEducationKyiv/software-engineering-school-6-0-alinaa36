import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Redis } from 'ioredis';
import { RedisIdempotencyStore } from '../adapters/redis-idempotency.store';

function makeRedis() {
  return {
    set: vi.fn(),
    del: vi.fn().mockResolvedValue(1),
  };
}

describe('RedisIdempotencyStore', () => {
  let redis: ReturnType<typeof makeRedis>;
  let store: RedisIdempotencyStore;

  beforeEach(() => {
    vi.clearAllMocks();
    redis = makeRedis();
    store = new RedisIdempotencyStore(redis as unknown as Redis, 3600);
  });

  describe('markIfFirst', () => {
    it('використовує SET NX EX з неймспейсом і TTL', async () => {
      redis.set.mockResolvedValue('OK');

      await store.markIfFirst('release:a@b.com:owner/repo:v1');

      expect(redis.set).toHaveBeenCalledWith(
        'notif:idemp:release:a@b.com:owner/repo:v1',
        '1',
        'EX',
        3600,
        'NX',
      );
    });

    it('повертає true коли ключ встановлено вперше', async () => {
      redis.set.mockResolvedValue('OK');

      await expect(store.markIfFirst('key-1')).resolves.toBe(true);
    });

    it('повертає false коли ключ уже існує (дублікат)', async () => {
      redis.set.mockResolvedValue(null);

      await expect(store.markIfFirst('key-1')).resolves.toBe(false);
    });
  });

  describe('release', () => {
    it('видаляє ключ із неймспейсом', async () => {
      await store.release('key-1');

      expect(redis.del).toHaveBeenCalledWith('notif:idemp:key-1');
    });
  });
});
