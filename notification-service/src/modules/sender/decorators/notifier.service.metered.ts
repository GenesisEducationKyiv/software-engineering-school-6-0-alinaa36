import { notifierDurationSeconds, notifierEmailsTotal } from '../../../lib/metrics/metrics';
import { withTimer } from '../../../lib/metrics/metrics.helpers';
import type { INotifierService, ReleaseNotificationPayload } from '../interfaces/notifier.interface';

export class MeteredNotifierService implements INotifierService {
  constructor(private readonly notifier: INotifierService) {}

  async sendReleaseNotification(payload: ReleaseNotificationPayload): Promise<void> {
    try {
      await withTimer(notifierDurationSeconds, () => this.notifier.sendReleaseNotification(payload));
      notifierEmailsTotal.inc({ type: 'release', status: 'success' });
    } catch (error) {
      notifierEmailsTotal.inc({ type: 'release', status: 'failure' });
      throw error;
    }
  }

  async sendConfirmationEmail(email: string, repoFullName: string, token: string): Promise<void> {
    try {
      await withTimer(notifierDurationSeconds, () =>
        this.notifier.sendConfirmationEmail(email, repoFullName, token),
      );
      notifierEmailsTotal.inc({ type: 'confirmation', status: 'success' });
    } catch (error) {
      notifierEmailsTotal.inc({ type: 'confirmation', status: 'failure' });
      throw error;
    }
  }
}
