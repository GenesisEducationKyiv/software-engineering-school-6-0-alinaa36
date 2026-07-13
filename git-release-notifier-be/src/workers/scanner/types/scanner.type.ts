export interface ScanJobPayload {
  repos: string[];
  lockKey: string;
}

export interface OutdatedSubscriber {
  id: string;
  email: string;
  unsubscribeToken: string;
}
