export interface ScanJobPayload {
  repos: string[];
  lockKey: string;
}

export interface ISourceProvider {
  getLatestReleasesBatch(repos: string[]): Promise<Record<string, string | null>>;
}

export interface INotifier {
  sendReleaseNotification(
    email: string,
    repo: string,
    tag: string,
    unsubscribeToken: string,
  ): Promise<void>;
}

export interface ISubscriptionRepository {
  getOutdatedSubscribers(
    repo: string,
    newTag: string,
  ): Promise<Array<{ id: string; email: string; unsubscribeToken: string }>>;

  updateTags(subscriberIds: string[], newTag: string): Promise<void>;
}

export interface ProcessorDeps {
  provider: ISourceProvider;
  notifier: INotifier;
  repository: ISubscriptionRepository;
}
