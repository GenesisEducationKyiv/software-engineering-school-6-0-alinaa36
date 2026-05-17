export interface ScanJobPayload {
  repos: string[];
  lockKey: string;
}

export interface ReleaseNotificationPayload {
  email: string;
  repo: string;
  tag: string;
  unsubscribeToken: string;
}

export interface OutdatedSubscriber {
  id: string;
  email: string;
  unsubscribeToken: string;
}
