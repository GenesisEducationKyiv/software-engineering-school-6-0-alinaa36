import type { BatchReleaseResult } from '../../../modules/github/types/github-info.type';
import type { IScannerSubscriptionRepository } from '../../../modules/subscriptions/interfaces/subscription-repository.interface';
import type { ReleaseNotificationPayload } from '../../../modules/sender/interfaces/notifier.interface';

export interface ISourceProvider {
  getLatestReleasesBatch(repos: string[]): Promise<BatchReleaseResult>;
}

export interface INotifier {
  sendReleaseNotification(payload: ReleaseNotificationPayload): Promise<void>;
}

export interface ProcessorDeps {
  provider: ISourceProvider;
  notifier: INotifier;
  repository: IScannerSubscriptionRepository;
}

export interface IBatchProcessor {
  process(repos: string[]): Promise<void>;
}
