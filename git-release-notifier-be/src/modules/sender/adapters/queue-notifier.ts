import { releaseIdempotencyKey, confirmationIdempotencyKey } from '@grn/contracts';
import type {
  INotifierService,
  ReleaseNotificationPayload,
} from '../interfaces/notifier.interface';
import type { IEmailQueue } from '../interfaces/email-queue.interface';

export class QueueNotifier implements INotifierService {
  constructor(private readonly queue: IEmailQueue) {}

  sendReleaseNotification(payload: ReleaseNotificationPayload): Promise<void> {
    return this.queue.publish({
      type: 'release',
      idempotencyKey: releaseIdempotencyKey(payload.email, payload.repo, payload.tag),
      ...payload,
    });
  }

  sendConfirmationEmail(email: string, repoFullName: string, token: string): Promise<void> {
    return this.queue.publish({
      type: 'confirmation',
      idempotencyKey: confirmationIdempotencyKey(email, repoFullName, token),
      email,
      repo: repoFullName,
      confirmToken: token,
    });
  }
}
