import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Redis } from 'ioredis';
import { RedisIdempotencyStore } from '../adapters/redis-idempotency.store';

function makeRedis() {
  return {
    set: vi.fn(),
    get: vi.fn(),
    del: vi.fn().mockResolvedValue(1),
  };
}

describe('RedisIdempotencyStore', () => {
  let redis: ReturnType<typeof makeRedis>;
  let store: RedisIdempotencyStore;

  beforeEach(() => {
    vi.clearAllMocks();
    redis = makeRedis();
    store = new RedisIdempotencyStore(redis as unknown as Redis, 3600, 60);
  });

  describe('claim', () => {
    it('використовує SET NX EX з неймспейсом і lease-TTL', async () => {
      redis.set.mockResolvedValue('OK');

      await store.claim('release:a@b.com:owner/repo:v1');

      expect(redis.set).toHaveBeenCalledWith(
        'notif:idemp:release:a@b.com:owner/repo:v1',
        'pending',
        'EX',
        60,
        'NX',
      );
    });

    it('повертає "claimed" коли ключ встановлено вперше', async () => {
      redis.set.mockResolvedValue('OK');

      await expect(store.claim('key-1')).resolves.toBe('claimed');
      expect(redis.get).not.toHaveBeenCalled();
    });

    it('повертає "done" коли ключ уже підтверджений', async () => {
      redis.set.mockResolvedValue(null);
      redis.get.mockResolvedValue('done');

      await expect(store.claim('key-1')).resolves.toBe('done');
      expect(redis.get).toHaveBeenCalledWith('notif:idemp:key-1');
    });

    it('повертає "in_progress" коли ключ зайнятий (pending)', async () => {
      redis.set.mockResolvedValue(null);
      redis.get.mockResolvedValue('pending');

      await expect(store.claim('key-1')).resolves.toBe('in_progress');
    });

    it('повертає "in_progress" коли ключ зник між SET і GET', async () => {
      redis.set.mockResolvedValue(null);
      redis.get.mockResolvedValue(null);

      await expect(store.claim('key-1')).resolves.toBe('in_progress');
    });
  });

  describe('confirm', () => {
    it('встановлює done з довгим TTL і неймспейсом', async () => {
      redis.set.mockResolvedValue('OK');

      await store.confirm('key-1');

      expect(redis.set).toHaveBeenCalledWith('notif:idemp:key-1', 'done', 'EX', 3600);
    });
  });

  describe('release', () => {
    it('видаляє ключ із неймспейсом', async () => {
      await store.release('key-1');

      expect(redis.del).toHaveBeenCalledWith('notif:idemp:key-1');
    });
  });
});
