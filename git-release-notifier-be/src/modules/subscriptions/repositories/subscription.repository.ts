import type { PrismaClient, Subscription } from '@prisma/client';
import type {
  IScannerSubscriptionRepository,
  ISubscriptionRepository,
  ISubscriptionTagRepository,
  OutdatedSubscriber,
  RepositoryGroup,
  SubscriptionEntity,
  SubscriptionSummary,
} from '../interfaces/subscription-repository.interface';

export enum SubscriptionStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
}

export class SubscriptionRepository
  implements ISubscriptionRepository, IScannerSubscriptionRepository, ISubscriptionTagRepository
{
  constructor(private readonly prisma: PrismaClient) {}

  async upsertPending(email: string, repository: string): Promise<SubscriptionEntity> {
    const raw = await this.prisma.subscription.upsert({
      where: { email_repository: { email, repository } },
      update: { status: SubscriptionStatus.PENDING },
      create: { email, repository, status: SubscriptionStatus.PENDING },
    });

    return this.toEntity(raw);
  }

  async findByConfirmToken(token: string): Promise<SubscriptionEntity | null> {
    const raw = await this.prisma.subscription.findUnique({ where: { confirmToken: token } });

    return raw ? this.toEntity(raw) : null;
  }

  async checkIfActiveExists(email: string, repository: string): Promise<boolean> {
    const existing = await this.prisma.subscription.findFirst({
      where: { email, repository, status: SubscriptionStatus.ACTIVE },
    });

    return !!existing;
  }

  async activate(id: string): Promise<SubscriptionEntity> {
    const raw = await this.prisma.subscription.update({
      where: { id },
      data: { status: SubscriptionStatus.ACTIVE },
    });

    return this.toEntity(raw);
  }

  async findByUnsubscribeToken(token: string): Promise<SubscriptionEntity | null> {
    const raw = await this.prisma.subscription.findUnique({ where: { unsubscribeToken: token } });

    return raw ? this.toEntity(raw) : null;
  }

  async delete(id: string): Promise<SubscriptionEntity> {
    const raw = await this.prisma.subscription.delete({ where: { id } });

    return this.toEntity(raw);
  }

  async findByEmail(email: string): Promise<SubscriptionSummary[]> {
    const rows = await this.prisma.subscription.findMany({
      where: { email },
      select: { repository: true, status: true, createdAt: true },
    });

    return rows.map((row) => ({
      ...row,
      status: row.status as SubscriptionEntity['status'],
    }));
  }

  async countActive(): Promise<number> {
    return this.prisma.subscription.count({ where: { status: SubscriptionStatus.ACTIVE } });
  }

  async groupByRepository(): Promise<RepositoryGroup[]> {
    const rows = await this.prisma.subscription.groupBy({
      by: ['repository'],
      where: { status: SubscriptionStatus.ACTIVE },
      _count: { repository: true },
    });

    return rows.map((row) => ({
      repository: row.repository,
      count: row._count.repository,
    }));
  }

  async getOutdatedSubscribers(repoName: string, newTag: string): Promise<OutdatedSubscriber[]> {
    return this.prisma.subscription.findMany({
      where: {
        repository: repoName,
        status: SubscriptionStatus.ACTIVE,
        OR: [{ lastSeenTag: { not: newTag } }, { lastSeenTag: null }],
      },
      select: { id: true, email: true, unsubscribeToken: true },
    });
  }

  async advanceTag(email: string, repository: string, tag: string): Promise<void> {
    await this.prisma.subscription.updateMany({
      where: { email, repository },
      data: { lastSeenTag: tag },
    });
  }

  private toEntity(raw: Subscription): SubscriptionEntity {
    return {
      ...raw,
      status: raw.status as SubscriptionEntity['status'],
    };
  }
}
