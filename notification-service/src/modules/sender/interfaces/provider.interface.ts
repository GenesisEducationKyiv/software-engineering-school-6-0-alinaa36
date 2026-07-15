import type { SendEmailOptions } from '../types/sender-options.type';

export interface EmailProvider {
  sendEmail(options: SendEmailOptions): Promise<void>;
}
