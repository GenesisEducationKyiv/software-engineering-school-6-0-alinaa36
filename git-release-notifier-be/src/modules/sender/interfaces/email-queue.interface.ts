import type { EmailMessage } from '@grn/contracts';

export interface IEmailQueue {
  publish(msg: EmailMessage): Promise<void>;
}
