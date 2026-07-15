import type {
  SubscriptionEntity,
  SubscriptionSummary,
  RepositoryGroup,
} from './subscription-repository.interface';

export interface ISubscriptionService {
  subscribeToRepo(email: string, repository: string): Promise<SubscriptionEntity>;
  confirmSubscription(token: string): Promise<SubscriptionEntity>;
  unsubscribeFromRepo(token: string): Promise<SubscriptionEntity>;
  getSubscriptionsByEmail(email: string): Promise<SubscriptionSummary[]>;
  groupByRepository(): Promise<RepositoryGroup[]>;
}
