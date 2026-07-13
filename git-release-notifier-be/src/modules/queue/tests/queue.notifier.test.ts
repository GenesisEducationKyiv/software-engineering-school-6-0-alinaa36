import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mocked } from 'vitest';
import type { Channel } from 'amqplib';

vi.mock('../../../lib/config/env.config', () => ({
  config: {
    app: { url: 'http://localhost:3000', isProd: false },
    rabbit: { url: 'amqp://localhost' },
    github: { token: 'test-token' },
  },
}));

vi.mock('../../../lib/rabbit/rabbit.channel', () => ({
  createChannel: vi.fn(),
  QUEUE_NAME: 'github-scanner-queue',
}));

vi.mock('../../../lib/rabbit/rabbit.connection', () => ({
  getRabbitConnection: vi.fn(),
}));

vi.mock('../../../workers/config/worker.config', () => ({
  WorkerConfig: {
    BATCH_SIZE: 3,
  },
}));

import { createChannel } from '../../../lib/rabbit/rabbit.channel';
import { addScanJobs } from '../queue.notifier';
import type { ILockStore } from '../../../workers/scanner/infrastructure/lock/lock-store.interface';
import { RabbitScanQueue } from '../adapters/rabbit-scan-queue';

// ---- типи ----

type ScanJobPayload = { repos: string[]; lockKey: string };

// ---- helpers ----

function makeChannel(): Channel {
  return {
    sendToQueue: vi.fn().mockReturnValue(true),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as Channel;
}

function makeLockStore(): Mocked<ILockStore> {
  return {
    acquireForBatch: vi.fn().mockResolvedValue({ acquired: true, lockKey: 'lock:scan:default' }),
    unlock: vi.fn().mockResolvedValue(undefined),
  };
}

function getPayload<T>(channel: Channel, callIndex = 0): T {
  const buffer = vi.mocked(channel.sendToQueue).mock.calls[callIndex][1] as Buffer;

  return JSON.parse(buffer.toString()) as T;
}

// ---- тести ----

describe('addScanJobs', () => {
  let channel: Channel;
  let lockStore: Mocked<ILockStore>;
  let queue: RabbitScanQueue;

  beforeEach(() => {
    vi.clearAllMocks();
    channel = makeChannel();
    lockStore = makeLockStore();
    queue = new RabbitScanQueue();
    vi.mocked(createChannel).mockResolvedValue(channel);
  });

  // --- базова поведінка ---

  it('не відправляє жодного повідомлення для порожнього масиву', async () => {
    await addScanJobs([], lockStore, queue);

    expect(vi.mocked(channel.sendToQueue)).not.toHaveBeenCalled();
  });

  it('закриває channel навіть якщо repos порожній', async () => {
    await addScanJobs([], lockStore, queue);

    expect(channel.close).toHaveBeenCalledOnce();
  });

  it('відправляє одне повідомлення для одного репозиторію', async () => {
    await addScanJobs(['user/repo'], lockStore, queue);

    expect(vi.mocked(channel.sendToQueue)).toHaveBeenCalledTimes(1);
  });

  it('закриває channel після відправки', async () => {
    await addScanJobs(['user/repo'], lockStore, queue);

    expect(channel.close).toHaveBeenCalledOnce();
  });

  // --- розбивка на батчі ---

  describe('розбивка на батчі', () => {
    it('розбиває репозиторії на батчі по BATCH_SIZE', async () => {
      const repos = ['r/1', 'r/2', 'r/3', 'r/4', 'r/5', 'r/6', 'r/7'];

      await addScanJobs(repos, lockStore, queue);

      expect(vi.mocked(channel.sendToQueue)).toHaveBeenCalledTimes(3);
    });

    it('payload першого батчу містить перші BATCH_SIZE репозиторіїв', async () => {
      await addScanJobs(['r/1', 'r/2', 'r/3', 'r/4'], lockStore, queue);

      expect(getPayload<ScanJobPayload>(channel, 0).repos).toEqual(['r/1', 'r/2', 'r/3']);
    });

    it('останній батч містить залишок репозиторіїв', async () => {
      await addScanJobs(['r/1', 'r/2', 'r/3', 'r/4'], lockStore, queue);

      expect(getPayload<ScanJobPayload>(channel, 1).repos).toEqual(['r/4']);
    });
  });

  // --- Redis lock ---

  describe('Redis lock', () => {
    it('викликає acquireForBatch для кожного батчу', async () => {
      await addScanJobs(['r/1', 'r/2', 'r/3', 'r/4'], lockStore, queue);

      expect(lockStore.acquireForBatch).toHaveBeenCalledTimes(2);
    });

    it('викликає acquireForBatch з репозиторіями батчу', async () => {
      await addScanJobs(['r/1', 'r/2', 'r/3'], lockStore, queue);

      expect(lockStore.acquireForBatch).toHaveBeenCalledWith(['r/1', 'r/2', 'r/3']);
    });

    it('пропускає батч якщо замок вже встановлено', async () => {
      lockStore.acquireForBatch
        .mockResolvedValueOnce({ acquired: false, lockKey: 'lock:scan:1' })
        .mockResolvedValueOnce({ acquired: true, lockKey: 'lock:scan:2' });

      await addScanJobs(['r/1', 'r/2', 'r/3', 'r/4'], lockStore, queue);

      expect(vi.mocked(channel.sendToQueue)).toHaveBeenCalledTimes(1);
    });

    it('пропускає всі батчі якщо всі замки встановлено', async () => {
      lockStore.acquireForBatch.mockResolvedValue({ acquired: false, lockKey: 'lock:scan:1' });

      await addScanJobs(['r/1', 'r/2', 'r/3'], lockStore, queue);

      expect(vi.mocked(channel.sendToQueue)).not.toHaveBeenCalled();
    });

    it('payload містить lockKey від acquireForBatch', async () => {
      lockStore.acquireForBatch.mockResolvedValue({ acquired: true, lockKey: 'lock:scan:test' });

      await addScanJobs(['user/repo'], lockStore, queue);

      expect(getPayload<ScanJobPayload>(channel, 0).lockKey).toBe('lock:scan:test');
    });
  });

  // --- формат повідомлення ---

  describe('формат повідомлення', () => {
    it('відправляє повідомлення з persistent: true', async () => {
      await addScanJobs(['user/repo'], lockStore, queue);

      expect(vi.mocked(channel.sendToQueue).mock.calls[0][2]).toEqual({ persistent: true });
    });

    it('payload містить repos та lockKey з коректними значеннями', async () => {
      lockStore.acquireForBatch.mockResolvedValue({ acquired: true, lockKey: 'lock:scan:abc' });

      await addScanJobs(['user/repo'], lockStore, queue);

      const payload = getPayload<ScanJobPayload>(channel, 0);

      expect(payload.repos).toEqual(['user/repo']);
      expect(payload.lockKey).toBe('lock:scan:abc');
    });
  });

  // --- помилки ---

  describe('помилки', () => {
    it('пробрасовує помилку якщо createChannel кинув виняток', async () => {
      vi.mocked(createChannel).mockRejectedValue(new Error('RabbitMQ unavailable'));

      await expect(addScanJobs(['user/repo'], lockStore, queue)).rejects.toThrow(
        'RabbitMQ unavailable',
      );
    });

    it('пробрасовує помилку якщо acquireForBatch кинув виняток', async () => {
      lockStore.acquireForBatch.mockRejectedValue(new Error('Redis unavailable'));

      await expect(addScanJobs(['user/repo'], lockStore, queue)).rejects.toThrow(
        'Redis unavailable',
      );
    });

    it('закриває channel навіть якщо acquireForBatch кинув виняток', async () => {
      lockStore.acquireForBatch.mockRejectedValue(new Error('Redis unavailable'));

      await addScanJobs(['user/repo'], lockStore, queue).catch(() => {});

      expect(channel.close).toHaveBeenCalledOnce();
    });

    it('закриває channel навіть якщо sendToQueue повернув false', async () => {
      vi.mocked(channel.sendToQueue).mockReturnValue(false);

      await addScanJobs(['user/repo'], lockStore, queue);

      expect(channel.close).toHaveBeenCalledOnce();
    });
  });
});
