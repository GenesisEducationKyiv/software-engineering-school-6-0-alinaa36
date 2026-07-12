export interface ReleaseNotificationPayload {
  email: string;
  repo: string;
  tag: string;
  unsubscribeToken: string;
}

export interface IConfirmationSender {
  sendConfirmationEmail(email: string, repoFullName: string, token: string): Promise<void>;
}

export interface INotifierService extends IConfirmationSender {
  sendReleaseNotification(payload: ReleaseNotificationPayload): Promise<void>;
}
