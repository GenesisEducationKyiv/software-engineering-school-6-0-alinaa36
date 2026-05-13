import { Subscription } from '@prisma/client';

export interface RepositoryGroup {
  repository: string;
  count: number;
}

export interface ISubscriptionRepository {
  checkIfActiveExists(email: string, repository: string): Promise<boolean>;
  upsertPending(email: string, repository: string): Promise<Subscription>;
  findByConfirmToken(token: string): Promise<Subscription | null>;
  activate(id: string): Promise<Subscription>;
  findByUnsubscribeToken(token: string): Promise<Subscription | null>;
  delete(id: string): Promise<Subscription>;
  findByEmail(email: string): Promise<Pick<Subscription, 'repository' | 'status' | 'createdAt'>[]>;
  countActive(): Promise<number>;
  groupByRepository(): Promise<RepositoryGroup[]>;
}
