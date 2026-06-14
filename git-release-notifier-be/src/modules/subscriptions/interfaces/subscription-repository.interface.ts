export interface OutdatedSubscriber {
  id: string;
  email: string;
  unsubscribeToken: string;
}

export interface IScannerSubscriptionRepository {
  getOutdatedSubscribers(repo: string, newTag: string): Promise<OutdatedSubscriber[]>;
  updateTags(subscriberIds: string[], newTag: string): Promise<void>;
}

export interface SubscriptionEntity {
  id: string;
  email: string;
  repository: string;
  status: 'PENDING' | 'ACTIVE';
  confirmToken: string;
  unsubscribeToken: string;
  lastSeenTag: string | null;
  createdAt: Date;
}

export interface SubscriptionSummary {
  repository: string;
  status: 'PENDING' | 'ACTIVE';
  createdAt: Date;
}

export interface RepositoryGroup {
  repository: string;
  count: number;
}

export interface ISubscriptionRepository {
  checkIfActiveExists(email: string, repository: string): Promise<boolean>;
  upsertPending(email: string, repository: string): Promise<SubscriptionEntity>;
  findByConfirmToken(token: string): Promise<SubscriptionEntity | null>;
  activate(id: string): Promise<SubscriptionEntity>;
  findByUnsubscribeToken(token: string): Promise<SubscriptionEntity | null>;
  delete(id: string): Promise<SubscriptionEntity>;
  findByEmail(email: string): Promise<SubscriptionSummary[]>;
  countActive(): Promise<number>;
  groupByRepository(): Promise<RepositoryGroup[]>;
}
