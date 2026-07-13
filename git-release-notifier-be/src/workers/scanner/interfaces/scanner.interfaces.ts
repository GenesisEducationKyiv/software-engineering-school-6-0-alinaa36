import type { BatchReleaseResult } from '../../../modules/github/types/github-info.type';
import type { OutdatedSubscriber } from '../types/scanner.type';
import type { ReleaseNotificationPayload } from '../../../modules/sender/interfaces/notifier.interface';

export interface ISourceProvider {
  getLatestReleasesBatch(repos: string[]): Promise<BatchReleaseResult>;
}

export interface INotifier {
  sendReleaseNotification(payload: ReleaseNotificationPayload): Promise<void>;
}

export interface IScannerSubscriptionRepository {
  getOutdatedSubscribers(repo: string, newTag: string): Promise<Array<OutdatedSubscriber>>;
  updateTags(subscriberIds: string[], newTag: string): Promise<void>;
}

export interface ProcessorDeps {
  provider: ISourceProvider;
  notifier: INotifier;
  repository: IScannerSubscriptionRepository;
}
