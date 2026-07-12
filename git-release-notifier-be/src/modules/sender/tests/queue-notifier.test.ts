import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueueNotifier } from '../adapters/queue-notifier';
import type { IEmailQueue } from '../interfaces/email-queue.interface';

function makeQueue() {
  return { publish: vi.fn().mockResolvedValue(undefined) } satisfies IEmailQueue;
}

describe('QueueNotifier', () => {
  let queue: ReturnType<typeof makeQueue>;
  let notifier: QueueNotifier;

  beforeEach(() => {
    vi.clearAllMocks();
    queue = makeQueue();
    notifier = new QueueNotifier(queue);
  });

  describe('sendReleaseNotification', () => {
    const payload = {
      email: 'user@example.com',
      repo: 'facebook/react',
      tag: 'v18.0.0',
      unsubscribeToken: 'token-123',
    } as const;

    it('публікує одне повідомлення в чергу', async () => {
      await notifier.sendReleaseNotification(payload);

      expect(queue.publish).toHaveBeenCalledOnce();
    });

    it('публікує release-payload із type та всіма полями', async () => {
      await notifier.sendReleaseNotification(payload);

      expect(queue.publish).toHaveBeenCalledWith({
        type: 'release',
        idempotencyKey: 'release:user@example.com:facebook/react:v18.0.0',
        email: 'user@example.com',
        repo: 'facebook/react',
        tag: 'v18.0.0',
        unsubscribeToken: 'token-123',
      });
    });

    it('пробрасовує помилку якщо publish кинув виняток', async () => {
      queue.publish.mockRejectedValue(new Error('queue down'));

      await expect(notifier.sendReleaseNotification(payload)).rejects.toThrow('queue down');
    });
  });
});
