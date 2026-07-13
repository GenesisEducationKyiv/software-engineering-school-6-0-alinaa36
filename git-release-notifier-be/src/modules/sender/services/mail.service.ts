import { config } from '../../../lib/config/env.config';
import { EmailProvider } from '../interfaces/provider.interface';
import { EtherealProvider } from '../mail.provider';
import { getReleaseEmailTemplate, getConfirmationEmailTemplate } from '../templates/mail.template';

export class NotifierService {
  constructor(private provider: EmailProvider) {}

  async sendReleaseNotification(
    email: string,
    repoFullName: string,
    tagName: string,
    unsubscribeToken: string,
  ) {
    const baseUrl = config.app.url;
    const unsubscribeUrl = `${baseUrl}/api/unsubscribe/${unsubscribeToken}`;

    const htmlContent = getReleaseEmailTemplate(repoFullName, tagName, unsubscribeUrl);
    const subject = `Новий реліз: ${repoFullName} ${tagName}`;

    await this.provider.sendEmail({
      to: email,
      subject,
      html: htmlContent,
    });
  }

  async sendConfirmationEmail(email: string, repoFullName: string, token: string) {
    const baseUrl = config.app.url;
    const confirmUrl = `${baseUrl}/api/confirm/${token}`;

    const htmlContent = getConfirmationEmailTemplate(repoFullName, confirmUrl);
    const subject = `Підтвердіть підписку на ${repoFullName}`;

    await this.provider.sendEmail({
      to: email,
      subject,
      html: htmlContent,
    });
  }
}

export const notifierService = new NotifierService(new EtherealProvider());
