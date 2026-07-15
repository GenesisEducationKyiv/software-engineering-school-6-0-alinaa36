import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mocked } from 'vitest';
import type { ConfirmChannel } from 'amqplib';

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

vi.mock('../../../modules/common/constants/api.constants', () => ({
  SCAN_BATCH_SIZE: 3,
}));

import { createChannel } from '../../../lib/rabbit/rabbit.channel';
import { ScanJobProducer } from '../queue.notifier';
import type { ILockStore } from '../interfaces/lock-store.interface';
import { RabbitScanQueue } from '../adapters/rabbit-scan-queue';

// ---- типи ----

type ScanJobPayload = { repos: string[]; lockKey: string; lockToken: string };

// ---- helpers ----

function makeChannel(): ConfirmChannel {
  return {
    sendToQueue: vi.fn().mockReturnValue(true),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as ConfirmChannel;
}

function makeLockStore(): Mocked<ILockStore> {
  return {
    acquireForBatch: vi
      .fn()
      .mockResolvedValue({ acquired: true, lockKey: 'lock:scan:default', token: 'token-default' }),
    unlock: vi.fn().mockResolvedValue(undefined),
  };
}

function getPayload<T>(channel: ConfirmChannel, callIndex = 0): T {
  const buffer = vi.mocked(channel.sendToQueue).mock.calls[callIndex][1] as Buffer;

  return JSON.parse(buffer.toString()) as T;
}

// ---- тести ----

describe('ScanJobProducer', () => {
  let channel: ConfirmChannel;
  let lockStore: Mocked<ILockStore>;
  let producer: ScanJobProducer;

  beforeEach(() => {
    vi.clearAllMocks();
    channel = makeChannel();
    lockStore = makeLockStore();
    producer = new ScanJobProducer(lockStore, new RabbitScanQueue());
    vi.mocked(createChannel).mockResolvedValue(channel);
  });

  // --- базова поведінка ---

  it('не відправляє жодного повідомлення для порожнього масиву', async () => {
    await producer.addScanJobs([]);

    expect(vi.mocked(channel.sendToQueue)).not.toHaveBeenCalled();
  });

  it('закриває channel навіть якщо repos порожній', async () => {
    await producer.addScanJobs([]);

    expect(channel.close).toHaveBeenCalledOnce();
  });

  it('відправляє одне повідомлення для одного репозиторію', async () => {
    await producer.addScanJobs(['user/repo']);

    expect(vi.mocked(channel.sendToQueue)).toHaveBeenCalledTimes(1);
  });

  it('закриває channel після відправки', async () => {
    await producer.addScanJobs(['user/repo']);

    expect(channel.close).toHaveBeenCalledOnce();
  });

  // --- розбивка на батчі ---

  describe('розбивка на батчі', () => {
    it('розбиває репозиторії на батчі по BATCH_SIZE', async () => {
      const repos = ['r/1', 'r/2', 'r/3', 'r/4', 'r/5', 'r/6', 'r/7'];

      await producer.addScanJobs(repos);

      expect(vi.mocked(channel.sendToQueue)).toHaveBeenCalledTimes(3);
    });

    it('payload першого батчу містить перші BATCH_SIZE репозиторіїв', async () => {
      await producer.addScanJobs(['r/1', 'r/2', 'r/3', 'r/4']);

      expect(getPayload<ScanJobPayload>(channel, 0).repos).toEqual(['r/1', 'r/2', 'r/3']);
    });

    it('останній батч містить залишок репозиторіїв', async () => {
      await producer.addScanJobs(['r/1', 'r/2', 'r/3', 'r/4']);

      expect(getPayload<ScanJobPayload>(channel, 1).repos).toEqual(['r/4']);
    });
  });

  // --- Redis lock ---

  describe('Redis lock', () => {
    it('викликає acquireForBatch для кожного батчу', async () => {
      await producer.addScanJobs(['r/1', 'r/2', 'r/3', 'r/4']);

      expect(lockStore.acquireForBatch).toHaveBeenCalledTimes(2);
    });

    it('викликає acquireForBatch з репозиторіями батчу', async () => {
      await producer.addScanJobs(['r/1', 'r/2', 'r/3']);

      expect(lockStore.acquireForBatch).toHaveBeenCalledWith(['r/1', 'r/2', 'r/3']);
    });

    it('пропускає батч якщо замок вже встановлено', async () => {
      lockStore.acquireForBatch
        .mockResolvedValueOnce({ acquired: false, lockKey: 'lock:scan:1', token: 'token-1' })
        .mockResolvedValueOnce({ acquired: true, lockKey: 'lock:scan:2', token: 'token-2' });

      await producer.addScanJobs(['r/1', 'r/2', 'r/3', 'r/4']);

      expect(vi.mocked(channel.sendToQueue)).toHaveBeenCalledTimes(1);
    });

    it('пропускає всі батчі якщо всі замки встановлено', async () => {
      lockStore.acquireForBatch.mockResolvedValue({
        acquired: false,
        lockKey: 'lock:scan:1',
        token: 'token-1',
      });

      await producer.addScanJobs(['r/1', 'r/2', 'r/3']);

      expect(vi.mocked(channel.sendToQueue)).not.toHaveBeenCalled();
    });

    it('payload містить lockKey від acquireForBatch', async () => {
      lockStore.acquireForBatch.mockResolvedValue({
        acquired: true,
        lockKey: 'lock:scan:test',
        token: 'token-test',
      });

      await producer.addScanJobs(['user/repo']);

      expect(getPayload<ScanJobPayload>(channel, 0).lockKey).toBe('lock:scan:test');
    });

    it('генерує різні ключі для різних батчів', async () => {
      lockStore.acquireForBatch
        .mockResolvedValueOnce({ acquired: true, lockKey: 'lock:scan:first', token: 'token-first' })
        .mockResolvedValueOnce({
          acquired: true,
          lockKey: 'lock:scan:second',
          token: 'token-second',
        });

      await producer.addScanJobs(['r/1', 'r/2', 'r/3', 'r/4']);

      const first = getPayload<ScanJobPayload>(channel, 0).lockKey;
      const second = getPayload<ScanJobPayload>(channel, 1).lockKey;

      expect(first).not.toBe(second);
    });

    it('релізує лок якщо sendToQueue повернув false', async () => {
      lockStore.acquireForBatch.mockResolvedValue({
        acquired: true,
        lockKey: 'lock:scan:test',
        token: 'token-test',
      });
      vi.mocked(channel.sendToQueue).mockReturnValue(false);

      await producer.addScanJobs(['user/repo']);

      expect(lockStore.unlock).toHaveBeenCalledWith('lock:scan:test', 'token-test');
    });

    it('не релізує лок якщо sendToQueue успішний', async () => {
      await producer.addScanJobs(['user/repo']);

      expect(lockStore.unlock).not.toHaveBeenCalled();
    });
  });

  // --- формат повідомлення ---

  describe('формат повідомлення', () => {
    it('відправляє повідомлення з persistent: true', async () => {
      await producer.addScanJobs(['user/repo']);

      expect(vi.mocked(channel.sendToQueue).mock.calls[0][2]).toEqual({ persistent: true });
    });

    it('payload містить repos та lockKey з коректними значеннями', async () => {
      lockStore.acquireForBatch.mockResolvedValue({
        acquired: true,
        lockKey: 'lock:scan:abc',
        token: 'token-abc',
      });

      await producer.addScanJobs(['user/repo']);

      const payload = getPayload<ScanJobPayload>(channel, 0);

      expect(payload.repos).toEqual(['user/repo']);
      expect(payload.lockKey).toBe('lock:scan:abc');
    });
  });

  // --- помилки ---

  describe('помилки', () => {
    it('пробрасовує помилку якщо createChannel кинув виняток', async () => {
      vi.mocked(createChannel).mockRejectedValue(new Error('RabbitMQ unavailable'));

      await expect(producer.addScanJobs(['user/repo'])).rejects.toThrow('RabbitMQ unavailable');
    });

    it('пробрасовує помилку якщо acquireForBatch кинув виняток', async () => {
      lockStore.acquireForBatch.mockRejectedValue(new Error('Redis unavailable'));

      await expect(producer.addScanJobs(['user/repo'])).rejects.toThrow('Redis unavailable');
    });

    it('закриває channel навіть якщо acquireForBatch кинув виняток', async () => {
      lockStore.acquireForBatch.mockRejectedValue(new Error('Redis unavailable'));

      await producer.addScanJobs(['user/repo']).catch(() => {});

      expect(channel.close).toHaveBeenCalledOnce();
    });

    it('закриває channel навіть якщо sendToQueue повернув false', async () => {
      vi.mocked(channel.sendToQueue).mockReturnValue(false);

      await producer.addScanJobs(['user/repo']);

      expect(channel.close).toHaveBeenCalledOnce();
    });
  });
});
