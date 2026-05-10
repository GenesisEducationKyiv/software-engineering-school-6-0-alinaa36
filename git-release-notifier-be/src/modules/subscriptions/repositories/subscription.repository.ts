import { Subscription } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { ISubscriptionRepository } from '../intarfaces/subscription-repository.interface';

export enum SubscriptionStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
}

export class SubscriptionRepository implements ISubscriptionRepository {
  async upsertPending(email: string, repository: string): Promise<Subscription> {
    return prisma.subscription.upsert({
      where: { email_repository: { email, repository } },
      update: { status: SubscriptionStatus.PENDING },
      create: { email, repository, status: SubscriptionStatus.PENDING },
    });
  }

  async findByConfirmToken(token: string): Promise<Subscription | null> {
    return prisma.subscription.findUnique({
      where: { confirmToken: token },
    });
  }

  async checkIfActiveExists(email: string, repository: string): Promise<boolean> {
    const existing = await prisma.subscription.findFirst({
      where: { email, repository, status: SubscriptionStatus.ACTIVE },
    });

    return !!existing;
  }

  async activate(id: string): Promise<Subscription> {
    return prisma.subscription.update({
      where: { id },
      data: { status: SubscriptionStatus.ACTIVE },
    });
  }

  async findByUnsubscribeToken(token: string): Promise<Subscription | null> {
    return prisma.subscription.findUnique({
      where: { unsubscribeToken: token },
    });
  }

  async delete(id: string): Promise<Subscription> {
    return prisma.subscription.delete({
      where: { id },
    });
  }

  async findByEmail(
    email: string,
  ): Promise<Pick<Subscription, 'repository' | 'status' | 'createdAt'>[]> {
    return prisma.subscription.findMany({
      where: { email },
      select: { repository: true, status: true, createdAt: true },
    });
  }

  async countActive(): Promise<number> {
    return prisma.subscription.count({ where: { status: SubscriptionStatus.ACTIVE } });
  }

  async groupByRepository() {
    return await prisma.subscription.groupBy({
      by: ['repository'],
      where: { status: SubscriptionStatus.ACTIVE },
      _count: { repository: true },
    });
  }
}
