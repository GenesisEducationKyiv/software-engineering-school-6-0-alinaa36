import { describe, it, expect, vi, beforeEach } from 'vitest';

const { incMock } = vi.hoisted(() => ({ incMock: vi.fn() }));

vi.mock('../../../lib/metrics/metrics', () => ({
  notifierDurationSeconds: { startTimer: () => () => undefined },
  notifierEmailsTotal: { inc: incMock },
}));

import { MeteredNotifierService } from '../decorators/notifier.service.metered';
import type { INotifierService } from '../interfaces/notifier.interface';

function makeInner() {
  return {
    sendReleaseNotification: vi.fn().mockResolvedValue(undefined),
    sendConfirmationEmail: vi.fn().mockResolvedValue(undefined),
  };
}

describe('MeteredNotifierService', () => {
  let inner: ReturnType<typeof makeInner>;
  let metered: MeteredNotifierService;

  const releasePayload = {
    email: 'user@example.com',
    repo: 'facebook/react',
    tag: 'v18.0.0',
    unsubscribeToken: 'token-123',
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();
    inner = makeInner();
    metered = new MeteredNotifierService(inner as unknown as INotifierService);
  });

  describe('sendReleaseNotification', () => {
    it('делегує виклик внутрішньому сервісу з тим самим payload', async () => {
      await metered.sendReleaseNotification(releasePayload);

      expect(inner.sendReleaseNotification).toHaveBeenCalledWith(releasePayload);
    });

    it('інкрементує лічильник success при успіху', async () => {
      await metered.sendReleaseNotification(releasePayload);

      expect(incMock).toHaveBeenCalledWith({ type: 'release', status: 'success' });
    });

    it('інкрементує лічильник failure і пробрасовує помилку при збої', async () => {
      inner.sendReleaseNotification.mockRejectedValue(new Error('boom'));

      await expect(metered.sendReleaseNotification(releasePayload)).rejects.toThrow('boom');
      expect(incMock).toHaveBeenCalledWith({ type: 'release', status: 'failure' });
    });
  });

  describe('sendConfirmationEmail', () => {
    it('делегує виклик і інкрементує success', async () => {
      await metered.sendConfirmationEmail('user@example.com', 'facebook/react', 'confirm-token');

      expect(inner.sendConfirmationEmail).toHaveBeenCalledWith(
        'user@example.com',
        'facebook/react',
        'confirm-token',
      );
      expect(incMock).toHaveBeenCalledWith({ type: 'confirmation', status: 'success' });
    });

    it('інкрементує failure і пробрасовує помилку при збої', async () => {
      inner.sendConfirmationEmail.mockRejectedValue(new Error('boom'));

      await expect(
        metered.sendConfirmationEmail('user@example.com', 'facebook/react', 'confirm-token'),
      ).rejects.toThrow('boom');
      expect(incMock).toHaveBeenCalledWith({ type: 'confirmation', status: 'failure' });
    });
  });
});
