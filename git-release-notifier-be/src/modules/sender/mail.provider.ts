import nodemailer from 'nodemailer';
import type { SendEmailOptions } from './types/sender-options.type';
import type { EmailProvider } from './interfaces/provider.interface';
import { Logger } from '../../lib/logger/logger';
import { config } from '../../lib/config/env.config';
import { MAIL_FROM } from './constants/mail.const';

export class SmtpProvider implements EmailProvider {
  private readonly transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.port,
      secure: false,
      auth: {
        user: config.mail.auth.user,
        pass: config.mail.auth.pass,
      },
    });
  }

  async sendEmail(options: SendEmailOptions): Promise<void> {
    try {
      const info = await this.transporter.sendMail({
        from: MAIL_FROM,
        to: options.to,
        subject: options.subject,
        html: options.html,
      });

      Logger.info(`[SMTP] Email sent! Preview: ${nodemailer.getTestMessageUrl(info)}`);
    } catch (error) {
      Logger.error({ err: error }, '[SMTP] Error sending email');
      throw error;
    }
  }
}
