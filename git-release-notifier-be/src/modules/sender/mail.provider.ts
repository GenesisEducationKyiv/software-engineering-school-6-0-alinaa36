import nodemailer from 'nodemailer';
import 'dotenv/config';
import { SendEmailOptions } from './types/sender-options.type';
import { EmailProvider } from './interfaces/provider.interface';
import { Logger } from '../../lib/logger/logger';
import { config } from '../../lib/config/env.config';

export class EtherealProvider implements EmailProvider {
  private transporter: nodemailer.Transporter;

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
        from: '"Git Release Notifier" <noreply@notifier.com>',
        to: options.to,
        subject: options.subject,
        html: options.html,
      });

      Logger.info(`[Ethereal] Email sent! Preview: ${nodemailer.getTestMessageUrl(info)}`);
    } catch (error) {
      Logger.error({ err: error }, '[Ethereal] Error sending email');
      throw error;
    }
  }
}
