import type { ConfirmationReply } from '@grn/contracts';

export interface IConfirmationReplyPublisher {
  publish(reply: ConfirmationReply): Promise<void>;
}
