import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as grpc from '@grpc/grpc-js';
import { DeliveryStatus, type SendReleaseNotificationRequest } from '@grn/contracts';

vi.mock('../../lib/config/env.config', () => ({
  config: { idempotency: { ttlSeconds: 3600 }, grpc: { port: 50052 } },
}));

vi.mock('../../lib/redis/redis', () => ({ redis: {} }));

import { handleSendReleaseNotification } from '../notification.grpc-server';

function makeNotifier() {
  return {
    sendReleaseNotification: vi.fn().mockResolvedValue(undefined),
    sendConfirmationEmail: vi.fn().mockResolvedValue(undefined),
  };
}

function makeIdempotency() {
  return {
    claim: vi.fn().mockResolvedValue('claimed'),
    confirm: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
  };
}

const validRequest: SendReleaseNotificationRequest = {
  email: 'user@example.com',
  repo: 'facebook/react',
  tag: 'v18.0.0',
  unsubscribeToken: 'token-123',
  idempotencyKey: 'release:user@example.com:facebook/react:v18.0.0',
};

function invoke(
  request: SendReleaseNotificationRequest,
  notifier: ReturnType<typeof makeNotifier>,
  idempotency: ReturnType<typeof makeIdempotency>,
) {
  const callback = vi.fn();
  const call = { request } as grpc.ServerUnaryCall<SendReleaseNotificationRequest, never>;

  return handleSendReleaseNotification(
    call,
    callback as never,
    notifier,
    idempotency,
  ).then(() => callback);
}

describe('handleSendReleaseNotification', () => {
  let notifier: ReturnType<typeof makeNotifier>;
  let idempotency: ReturnType<typeof makeIdempotency>;

  beforeEach(() => {
    vi.clearAllMocks();
    notifier = makeNotifier();
    idempotency = makeIdempotency();
  });

  describe('валідація', () => {
    const cases: Array<[keyof SendReleaseNotificationRequest, string]> = [
      ['email', 'email is required'],
      ['repo', 'repo is required'],
      ['tag', 'tag is required'],
      ['unsubscribeToken', 'unsubscribe_token is required'],
      ['idempotencyKey', 'idempotency_key is required'],
    ];

    it.each(cases)(
      'відхиляє з INVALID_ARGUMENT коли відсутнє поле %s',
      async (field, message) => {
        const callback = await invoke(
          { ...validRequest, [field]: '' },
          notifier,
          idempotency,
        );

        expect(callback).toHaveBeenCalledWith(
          expect.objectContaining({ code: grpc.status.INVALID_ARGUMENT, message }),
          null,
        );
        expect(idempotency.claim).not.toHaveBeenCalled();
        expect(notifier.sendReleaseNotification).not.toHaveBeenCalled();
      },
    );
  });

  describe('idempotency', () => {
    it('повертає UNAVAILABLE коли сховище недоступне', async () => {
      idempotency.claim.mockRejectedValue(new Error('redis down'));

      const callback = await invoke(validRequest, notifier, idempotency);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ code: grpc.status.UNAVAILABLE }),
        null,
      );
      expect(notifier.sendReleaseNotification).not.toHaveBeenCalled();
    });

    it('повертає DUPLICATE без відправки коли доставка вже підтверджена', async () => {
      idempotency.claim.mockResolvedValue('done');

      const callback = await invoke(validRequest, notifier, idempotency);

      expect(callback).toHaveBeenCalledWith(null, {
        status: DeliveryStatus.DELIVERY_STATUS_DUPLICATE,
        message: 'Already delivered',
      });
      expect(notifier.sendReleaseNotification).not.toHaveBeenCalled();
    });

    it('повертає ABORTED без відправки коли доставка вже в процесі', async () => {
      idempotency.claim.mockResolvedValue('in_progress');

      const callback = await invoke(validRequest, notifier, idempotency);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ code: grpc.status.ABORTED }),
        null,
      );
      expect(notifier.sendReleaseNotification).not.toHaveBeenCalled();
    });
  });

  describe('доставка', () => {
    it('відправляє нотифікацію, підтверджує ключ і повертає SENT при успіху', async () => {
      const callback = await invoke(validRequest, notifier, idempotency);

      expect(notifier.sendReleaseNotification).toHaveBeenCalledWith({
        email: validRequest.email,
        repo: validRequest.repo,
        tag: validRequest.tag,
        unsubscribeToken: validRequest.unsubscribeToken,
      });
      expect(idempotency.confirm).toHaveBeenCalledWith(validRequest.idempotencyKey);
      expect(callback).toHaveBeenCalledWith(null, {
        status: DeliveryStatus.DELIVERY_STATUS_SENT,
        message: 'Sent',
      });
      expect(idempotency.release).not.toHaveBeenCalled();
    });

    it('звільняє ключ, не підтверджує і повертає INTERNAL коли відправка впала', async () => {
      notifier.sendReleaseNotification.mockRejectedValue(new Error('smtp boom'));

      const callback = await invoke(validRequest, notifier, idempotency);

      expect(idempotency.release).toHaveBeenCalledWith(validRequest.idempotencyKey);
      expect(idempotency.confirm).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ code: grpc.status.INTERNAL }),
        null,
      );
    });
  });
});
