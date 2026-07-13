import type { BatchReleaseResult } from '../../../modules/github/types/github-info.type';
import type { ReleaseNotificationPayload, OutdatedSubscriber } from '../types/scanner.type';

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
