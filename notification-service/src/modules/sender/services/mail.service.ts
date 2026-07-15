import { config } from '../../../lib/config/env.config';
import type { EmailProvider } from '../interfaces/provider.interface';
import type { INotifierService, ReleaseNotificationPayload } from '../interfaces/notifier.interface';
import { getReleaseEmailTemplate, getConfirmationEmailTemplate } from '../templates/mail.template';

export class NotifierService implements INotifierService {
  private readonly baseUrl = config.app.url;

  constructor(private readonly provider: EmailProvider) {}

  async sendReleaseNotification({
    email,
    repo,
    tag,
    unsubscribeToken,
  }: ReleaseNotificationPayload): Promise<void> {
    const unsubscribeUrl = `${this.baseUrl}/unsubscribe/${unsubscribeToken}`;

    await this.provider.sendEmail({
      to: email,
      subject: `Новий реліз: ${repo} ${tag}`,
      html: getReleaseEmailTemplate(repo, tag, unsubscribeUrl),
    });
  }

  async sendConfirmationEmail(email: string, repoFullName: string, token: string): Promise<void> {
    const confirmUrl = `${this.baseUrl}/confirm/${token}`;

    await this.provider.sendEmail({
      to: email,
      subject: `Підтвердіть підписку на ${repoFullName}`,
      html: getConfirmationEmailTemplate(repoFullName, confirmUrl),
    });
  }
}
