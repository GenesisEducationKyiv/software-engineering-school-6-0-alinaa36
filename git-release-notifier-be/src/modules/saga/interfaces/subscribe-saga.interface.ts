import type { SubscriptionEntity } from '../../subscriptions/interfaces/subscription-repository.interface';

export interface ISubscribeSaga {
  start(email: string, repository: string): Promise<SubscriptionEntity>;
}
