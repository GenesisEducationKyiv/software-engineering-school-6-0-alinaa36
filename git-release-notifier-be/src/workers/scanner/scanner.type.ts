import { type BatchReleaseResult } from '../../modules/github/types/github-info.type';

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

export interface ISourceProvider {
  getLatestReleasesBatch(repos: string[]): Promise<BatchReleaseResult>;
}

export interface INotifier {
  sendReleaseNotification(payload: ReleaseNotificationPayload): Promise<void>;
}

export interface ISubscriptionRepository {
  getOutdatedSubscribers(repo: string, newTag: string): Promise<Array<OutdatedSubscriber>>;

  updateTags(subscriberIds: string[], newTag: string): Promise<void>;
}

export interface ProcessorDeps {
  provider: ISourceProvider;
  notifier: INotifier;
  repository: ISubscriptionRepository;
}
