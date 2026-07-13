import type { Subscription } from '@prisma/client';

export interface RepositoryGroup {
  repository: string;
  count: number;
}

export type SubscriptionSummary = Pick<Subscription, 'repository' | 'status' | 'createdAt'>;

export interface ISubscriptionRepository {
  checkIfActiveExists(email: string, repository: string): Promise<boolean>;
  upsertPending(email: string, repository: string): Promise<Subscription>;
  findByConfirmToken(token: string): Promise<Subscription | null>;
  activate(id: string): Promise<Subscription>;
  findByUnsubscribeToken(token: string): Promise<Subscription | null>;
  delete(id: string): Promise<Subscription>;
  findByEmail(email: string): Promise<SubscriptionSummary[]>;
  countActive(): Promise<number>;
  groupByRepository(): Promise<RepositoryGroup[]>;
}
