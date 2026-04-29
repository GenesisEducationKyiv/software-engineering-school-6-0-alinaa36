import { describe, it, expect, vi, beforeEach } from 'vitest';

// ← спочатку ВСІ vi.mock, імпорти після
vi.mock('../../../lib/config/env.config', () => ({
  config: {
    app: { url: 'http://localhost:3000', isProd: false },
    rabbit: { url: 'amqp://localhost' },
    github: { token: 'test-token' },
  },
}));

// ← шлях відносно тест-файлу: queue/tests/ → lib/rabbit/
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

// ← імпорти тільки після всіх vi.mock
import { createChannel } from '../../../lib/rabbit/rabbit.channel';
import { redis } from '../../../lib/redis/redis';
import { addScanJobs } from '../queue.notifier';

function makeChannel() {
  return {
    sendToQueue: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

// ---- тести ----

describe('addScanJobs', () => {
  let channel: ReturnType<typeof makeChannel>;

  beforeEach(() => {
    vi.clearAllMocks();
    channel = makeChannel();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(createChannel).mockResolvedValue(channel as any);
    vi.mocked(redis.set).mockResolvedValue('OK');
  });

  // --- базова поведінка ---

  it('не відправляє жодного повідомлення для порожнього масиву', async () => {
    await addScanJobs([]);

    expect(channel.sendToQueue).not.toHaveBeenCalled();
  });

  it('закриває channel навіть якщо repos порожній', async () => {
    await addScanJobs([]);

    expect(channel.close).toHaveBeenCalledOnce();
  });

  it('відправляє одне повідомлення для одного репозиторію', async () => {
    await addScanJobs(['user/repo']);

    expect(channel.sendToQueue).toHaveBeenCalledTimes(1);
  });

  it('закриває channel після відправки', async () => {
    await addScanJobs(['user/repo']);

    expect(channel.close).toHaveBeenCalledOnce();
  });

  // --- розбивка на батчі ---

  describe('розбивка на батчі', () => {
    it('розбиває репозиторії на батчі по BATCH_SIZE', async () => {
      // BATCH_SIZE = 3, передаємо 7 репо → 3 батчі (3 + 3 + 1)
      const repos = ['r/1', 'r/2', 'r/3', 'r/4', 'r/5', 'r/6', 'r/7'];

      await addScanJobs(repos);

      expect(channel.sendToQueue).toHaveBeenCalledTimes(3);
    });

    it('payload першого батчу містить перші BATCH_SIZE репозиторіїв', async () => {
      const repos = ['r/1', 'r/2', 'r/3', 'r/4'];

      await addScanJobs(repos);

      const firstCallBuffer = channel.sendToQueue.mock.calls[0][1] as Buffer;
      const firstPayload = JSON.parse(firstCallBuffer.toString());

      expect(firstPayload.repos).toEqual(['r/1', 'r/2', 'r/3']);
    });

    it('останній батч містить залишок репозиторіїв', async () => {
      const repos = ['r/1', 'r/2', 'r/3', 'r/4'];

      await addScanJobs(repos);

      const lastCallBuffer = channel.sendToQueue.mock.calls[1][1] as Buffer;
      const lastPayload = JSON.parse(lastCallBuffer.toString());

      expect(lastPayload.repos).toEqual(['r/4']);
    });
  });

  // --- Redis lock ---

  describe('Redis lock', () => {
    it('викликає redis.set з NX для кожного батчу', async () => {
      await addScanJobs(['r/1', 'r/2', 'r/3', 'r/4']);

      expect(redis.set).toHaveBeenCalledTimes(2);
      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining('lock:scan:'),
        'processing',
        'EX',
        300,
        'NX',
      );
    });

    it('пропускає батч якщо замок вже встановлено', async () => {
      // Перший батч заблокований, другий — вільний
      vi.mocked(redis.set).mockResolvedValueOnce(null).mockResolvedValueOnce('OK');

      await addScanJobs(['r/1', 'r/2', 'r/3', 'r/4']);

      expect(channel.sendToQueue).toHaveBeenCalledTimes(1);
    });

    it('пропускає всі батчі якщо всі замки встановлено', async () => {
      vi.mocked(redis.set).mockResolvedValue(null);

      await addScanJobs(['r/1', 'r/2', 'r/3']);

      expect(channel.sendToQueue).not.toHaveBeenCalled();
    });

    it('payload містить lockKey який відповідає ключу в Redis', async () => {
      await addScanJobs(['user/repo']);

      const redisKey = vi.mocked(redis.set).mock.calls[0][0] as string;
      const payloadBuffer = channel.sendToQueue.mock.calls[0][1] as Buffer;
      const payload = JSON.parse(payloadBuffer.toString());

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

      const options = channel.sendToQueue.mock.calls[0][2];
      expect(options).toEqual({ persistent: true });
    });

    it('payload є валідним JSON', async () => {
      await addScanJobs(['user/repo']);

      const buffer = channel.sendToQueue.mock.calls[0][1] as Buffer;
      expect(() => JSON.parse(buffer.toString())).not.toThrow();
    });

    it('payload містить repos і lockKey', async () => {
      await addScanJobs(['user/repo']);

      const buffer = channel.sendToQueue.mock.calls[0][1] as Buffer;
      const payload = JSON.parse(buffer.toString());

      expect(payload).toHaveProperty('repos');
      expect(payload).toHaveProperty('lockKey');
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
  });
});
