import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/config/env.config', () => ({
  config: { app: { url: 'https://notifier.example.com' } },
}));

import { NotifierService } from '../services/mail.service';
import type { EmailProvider } from '../interfaces/provider.interface';
import type { SendEmailOptions } from '../types/sender-options.type';

function makeProvider() {
  return { sendEmail: vi.fn<(o: SendEmailOptions) => Promise<void>>().mockResolvedValue(undefined) };
}

describe('NotifierService', () => {
  let provider: ReturnType<typeof makeProvider>;
  let service: NotifierService;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = makeProvider();
    service = new NotifierService(provider as unknown as EmailProvider);
  });

  describe('sendReleaseNotification', () => {
    const payload = {
      email: 'user@example.com',
      repo: 'facebook/react',
      tag: 'v18.0.0',
      unsubscribeToken: 'unsub-token-123',
    } as const;

    it('надсилає лист на адресу підписника', async () => {
      await service.sendReleaseNotification(payload);

      expect(provider.sendEmail).toHaveBeenCalledOnce();
      expect(provider.sendEmail.mock.calls[0][0].to).toBe('user@example.com');
    });

    it('тема містить репозиторій і тег', async () => {
      await service.sendReleaseNotification(payload);

      const { subject } = provider.sendEmail.mock.calls[0][0];
      expect(subject).toContain('facebook/react');
      expect(subject).toContain('v18.0.0');
    });

    it('html містить unsubscribe-URL із токеном і базовим APP_URL', async () => {
      await service.sendReleaseNotification(payload);

      const { html } = provider.sendEmail.mock.calls[0][0];
      expect(html).toContain('https://notifier.example.com/unsubscribe/unsub-token-123');
    });

    it('пробрасовує помилку якщо провайдер кинув виняток', async () => {
      provider.sendEmail.mockRejectedValue(new Error('smtp down'));

      await expect(service.sendReleaseNotification(payload)).rejects.toThrow('smtp down');
    });
  });

  describe('sendConfirmationEmail', () => {
    it('надсилає лист на адресу з темою-підтвердженням', async () => {
      await service.sendConfirmationEmail('user@example.com', 'facebook/react', 'confirm-token-xyz');

      expect(provider.sendEmail).toHaveBeenCalledOnce();
      const { to, subject } = provider.sendEmail.mock.calls[0][0];
      expect(to).toBe('user@example.com');
      expect(subject).toContain('facebook/react');
    });

    it('html містить confirm-URL із токеном і базовим APP_URL', async () => {
      await service.sendConfirmationEmail('user@example.com', 'facebook/react', 'confirm-token-xyz');

      const { html } = provider.sendEmail.mock.calls[0][0];
      expect(html).toContain('https://notifier.example.com/confirm/confirm-token-xyz');
    });

    it('пробрасовує помилку якщо провайдер кинув виняток', async () => {
      provider.sendEmail.mockRejectedValue(new Error('smtp down'));

      await expect(
        service.sendConfirmationEmail('user@example.com', 'facebook/react', 'confirm-token-xyz'),
      ).rejects.toThrow('smtp down');
    });
  });
});
