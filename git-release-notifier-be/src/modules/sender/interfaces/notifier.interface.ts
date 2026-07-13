export interface ReleaseNotificationPayload {
  email: string;
  repo: string;
  tag: string;
  unsubscribeToken: string;
}

export interface INotifierService {
  sendReleaseNotification(payload: ReleaseNotificationPayload): Promise<void>;
  sendConfirmationEmail(email: string, repoFullName: string, token: string): Promise<void>;
}
