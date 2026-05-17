import { describe, it, expect, vi, beforeEach } from 'vitest';
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

vi.mock('../../../lib/redis/redis', () => ({
  redis: { set: vi.fn(), del: vi.fn() },
}));

vi.mock('../../../workers/config/worker.config', () => ({
  WorkerConfig: {
    BATCH_SIZE: 3,
    LOCK_TTL_SECONDS: 300,
  },
}));

import { createChannel } from '../../../lib/rabbit/rabbit.channel';
import { redis } from '../../../lib/redis/redis';
import { addScanJobs } from '../queue.notifier';

// ---- типи ----

type ScanJobPayload = { repos: string[]; lockKey: string };

// ---- helpers ----

function makeChannel(): Channel {
  return {
    sendToQueue: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as Channel;
}

function getPayload<T>(channel: Channel, callIndex = 0): T {
  const buffer = vi.mocked(channel.sendToQueue).mock.calls[callIndex][1] as Buffer;

  return JSON.parse(buffer.toString()) as T;
}

// ---- тести ----

describe('addScanJobs', () => {
  let channel: Channel;

  beforeEach(() => {
    vi.clearAllMocks();
    channel = makeChannel();
    vi.mocked(createChannel).mockResolvedValue(channel);
    vi.mocked(redis.set).mockResolvedValue('OK');
  });

  // --- базова поведінка ---

  it('не відправляє жодного повідомлення для порожнього масиву', async () => {
    await addScanJobs([]);

    expect(vi.mocked(channel.sendToQueue)).not.toHaveBeenCalled();
  });

  it('закриває channel навіть якщо repos порожній', async () => {
    await addScanJobs([]);

    expect(channel.close).toHaveBeenCalledOnce();
  });

  it('відправляє одне повідомлення для одного репозиторію', async () => {
    await addScanJobs(['user/repo']);

    expect(vi.mocked(channel.sendToQueue)).toHaveBeenCalledTimes(1);
  });

  it('закриває channel після відправки', async () => {
    await addScanJobs(['user/repo']);

    expect(channel.close).toHaveBeenCalledOnce();
  });

  // --- розбивка на батчі ---

  describe('розбивка на батчі', () => {
    it('розбиває репозиторії на батчі по BATCH_SIZE', async () => {
      const repos = ['r/1', 'r/2', 'r/3', 'r/4', 'r/5', 'r/6', 'r/7'];

      await addScanJobs(repos);

      expect(vi.mocked(channel.sendToQueue)).toHaveBeenCalledTimes(3);
    });

    it('payload першого батчу містить перші BATCH_SIZE репозиторіїв', async () => {
      const repos = ['r/1', 'r/2', 'r/3', 'r/4'];

      await addScanJobs(repos);

      const firstPayload = getPayload<ScanJobPayload>(channel, 0);

      expect(firstPayload.repos).toEqual(['r/1', 'r/2', 'r/3']);
    });

    it('останній батч містить залишок репозиторіїв', async () => {
      const repos = ['r/1', 'r/2', 'r/3', 'r/4'];

      await addScanJobs(repos);

      const lastPayload = getPayload<ScanJobPayload>(channel, 1);

      expect(lastPayload.repos).toEqual(['r/4']);
    });
  });

  // --- Redis lock ---

  describe('Redis lock', () => {
    it('викликає redis.set з NX для кожного батчу', async () => {
      await addScanJobs(['r/1', 'r/2', 'r/3', 'r/4']);

      expect(redis.set).toHaveBeenCalledTimes(2);
    });

    it('викликає redis.set з правильними аргументами', async () => {
      await addScanJobs(['r/1']);

      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining('lock:scan:'),
        'processing',
        'EX',
        300,
        'NX',
      );
    });

    it('пропускає батч якщо замок вже встановлено', async () => {
      vi.mocked(redis.set).mockResolvedValueOnce(null).mockResolvedValueOnce('OK');

      await addScanJobs(['r/1', 'r/2', 'r/3', 'r/4']);

      expect(vi.mocked(channel.sendToQueue)).toHaveBeenCalledTimes(1);
    });

    it('пропускає всі батчі якщо всі замки встановлено', async () => {
      vi.mocked(redis.set).mockResolvedValue(null);

      await addScanJobs(['r/1', 'r/2', 'r/3']);

      expect(vi.mocked(channel.sendToQueue)).not.toHaveBeenCalled();
    });

    it('payload містить lockKey який відповідає ключу в Redis', async () => {
      await addScanJobs(['user/repo']);

      const redisKey = vi.mocked(redis.set).mock.calls[0][0] as string;
      const payload = getPayload<ScanJobPayload>(channel, 0);

      expect(payload.lockKey).toBe(redisKey);
    });

    it('генерує різні ключі для різних батчів', async () => {
      await addScanJobs(['r/1', 'r/2', 'r/3', 'r/4']);

      const firstKey = vi.mocked(redis.set).mock.calls[0][0];
      const secondKey = vi.mocked(redis.set).mock.calls[1][0];

      expect(firstKey).not.toBe(secondKey);
    });
  });

  // --- формат повідомлення ---

  describe('формат повідомлення', () => {
    it('відправляє повідомлення з persistent: true', async () => {
      await addScanJobs(['user/repo']);

      const options = vi.mocked(channel.sendToQueue).mock.calls[0][2];

      expect(options).toEqual({ persistent: true });
    });

    it('payload містить repos та lockKey з коректними значеннями', async () => {
      await addScanJobs(['user/repo']);

      const payload = getPayload<ScanJobPayload>(channel, 0);

      expect(payload.repos).toEqual(['user/repo']);
      expect(payload.lockKey).toMatch(/^lock:scan:/);
    });
  });

  // --- помилки ---

  describe('помилки', () => {
    it('пробрасовує помилку якщо createChannel кинув виняток', async () => {
      vi.mocked(createChannel).mockRejectedValue(new Error('RabbitMQ unavailable'));

      await expect(addScanJobs(['user/repo'])).rejects.toThrow('RabbitMQ unavailable');
    });

    it('пробрасовує помилку якщо redis.set кинув виняток', async () => {
      vi.mocked(redis.set).mockRejectedValue(new Error('Redis unavailable'));

      await expect(addScanJobs(['user/repo'])).rejects.toThrow('Redis unavailable');
    });

    it('закриває channel навіть якщо redis.set кинув виняток', async () => {
      vi.mocked(redis.set).mockRejectedValue(new Error('Redis unavailable'));

      await addScanJobs(['user/repo']).catch(() => {});

      expect(channel.close).toHaveBeenCalledOnce();
    });

    it('закриває channel навіть якщо sendToQueue повернув false', async () => {
      vi.mocked(channel.sendToQueue).mockReturnValue(false);

      await addScanJobs(['user/repo']);

      expect(channel.close).toHaveBeenCalledOnce();
    });
  });
});
