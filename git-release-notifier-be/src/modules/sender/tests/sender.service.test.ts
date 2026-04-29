import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/config/env.config', () => ({
  config: {
    app: { url: 'http://localhost:3000', isProd: false },
    rabbit: { url: 'amqp://localhost' },
    redis: { url: 'redis://localhost' },
  },
}));

vi.mock('../mail.provider', () => ({
  EtherealProvider: vi.fn().mockImplementation(function () {
    return { sendEmail: vi.fn().mockResolvedValue(undefined) };
  }),
}));

vi.mock('../templates/mail.templa', () => ({
  getReleaseEmailTemplate: vi.fn().mockReturnValue('<html>release</html>'),
  getConfirmationEmailTemplate: vi.fn().mockReturnValue('<html>confirm</html>'),
}));

import { getReleaseEmailTemplate, getConfirmationEmailTemplate } from '../templates/mail.templa';
import { NotifierService } from '../services/mail.service';

function makeProvider() {
  return { sendEmail: vi.fn().mockResolvedValue(undefined) };
}

describe('NotifierService', () => {
  let provider: ReturnType<typeof makeProvider>;
  let service: NotifierService;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = makeProvider();
    service = new NotifierService(provider);
  });

  describe('sendReleaseNotification', () => {
    const defaultArgs = {
      email: 'user@example.com',
      repoFullName: 'facebook/react',
      tagName: 'v18.0.0',
      unsubscribeToken: 'token-123',
    } as const;

    async function callSend(overrides = {}) {
      const args = { ...defaultArgs, ...overrides };
      await service.sendReleaseNotification(
        args.email,
        args.repoFullName,
        args.tagName,
        args.unsubscribeToken,
      );
    }

    it('викликає provider.sendEmail один раз', async () => {
      await callSend();

      expect(provider.sendEmail).toHaveBeenCalledOnce();
    });

    it('відправляє лист на правильну адресу', async () => {
      await callSend({ email: 'test@example.com' });

      expect(provider.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'test@example.com' }),
      );
    });

    it('subject містить назву репо і тег', async () => {
      await callSend({ repoFullName: 'vuejs/vue', tagName: 'v3.0.0' });

      expect(provider.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ subject: expect.stringContaining('vuejs/vue') }),
      );
      expect(provider.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ subject: expect.stringContaining('v3.0.0') }),
      );
    });

    it('передає html з шаблону в provider', async () => {
      await callSend();

      expect(provider.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ html: '<html>release</html>' }),
      );
    });

    it('передає коректний unsubscribeUrl в шаблон', async () => {
      await callSend({ unsubscribeToken: 'abc-123' });

      expect(getReleaseEmailTemplate).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'http://localhost:3000/api/unsubscribe/abc-123',
      );
    });

    it('пробрасовує помилку якщо provider.sendEmail кинув виняток', async () => {
      provider.sendEmail.mockRejectedValue(new Error('SMTP unavailable'));

      await expect(callSend()).rejects.toThrow('SMTP unavailable');
    });
  });

  // --- sendConfirmationEmail ---

  describe('sendConfirmationEmail', () => {
    async function callConfirm(
      overrides: Partial<{
        email: string;
        repoFullName: string;
        token: string;
      }> = {},
    ) {
      const args = {
        email: 'user@example.com',
        repoFullName: 'facebook/react',
        token: 'confirm-token',
        ...overrides,
      };
      await service.sendConfirmationEmail(args.email, args.repoFullName, args.token);
    }

    it('викликає provider.sendEmail один раз', async () => {
      await callConfirm();

      expect(provider.sendEmail).toHaveBeenCalledOnce();
    });

    it('відправляє лист на правильну адресу', async () => {
      await callConfirm({ email: 'confirm@example.com' });

      expect(provider.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'confirm@example.com' }),
      );
    });

    it('subject містить назву репо', async () => {
      await callConfirm({ repoFullName: 'torvalds/linux' });

      expect(provider.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ subject: expect.stringContaining('torvalds/linux') }),
      );
    });

    it('передає коректний confirmUrl в шаблон', async () => {
      await callConfirm({ token: 'xyz-456' });

      expect(getConfirmationEmailTemplate).toHaveBeenCalledWith(
        expect.any(String),
        'http://localhost:3000/api/confirm/xyz-456',
      );
    });

    it('передає html з шаблону в provider', async () => {
      await callConfirm();

      expect(provider.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ html: '<html>confirm</html>' }),
      );
    });

    it('пробрасовує помилку якщо provider.sendEmail кинув виняток', async () => {
      provider.sendEmail.mockRejectedValue(new Error('SMTP unavailable'));

      await expect(callConfirm()).rejects.toThrow('SMTP unavailable');
    });
  });
});
