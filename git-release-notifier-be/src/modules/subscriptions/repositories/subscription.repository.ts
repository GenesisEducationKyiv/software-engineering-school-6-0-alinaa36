import { prisma } from '../../../lib/prisma';

export class SubscriptionRepository {
  async upsertPending(email: string, repository: string) {
    return await prisma.subscription.upsert({
      where: { email_repository: { email, repository } },
      update: { status: 'PENDING' },
      create: { email, repository, status: 'PENDING' },
    });
  }

  async findByConfirmToken(token: string) {
    return await prisma.subscription.findUnique({
      where: { confirmToken: token },
    });
  }

  async checkIfActiveExists(email: string, repository: string): Promise<boolean> {
    const existing = await prisma.subscription.findFirst({
      where: {
        email,
        repository,
        status: 'ACTIVE',
      },
    });

    return !!existing;
  }

  async activate(id: string) {
    return await prisma.subscription.update({
      where: { id },
      data: { status: 'ACTIVE' },
    });
  }

  async findByUnsubscribeToken(token: string) {
    return await prisma.subscription.findUnique({
      where: { unsubscribeToken: token },
    });
  }

  async delete(id: string) {
    return await prisma.subscription.delete({
      where: { id },
    });
  }

  async findByEmail(email: string) {
    return await prisma.subscription.findMany({
      where: { email },
      select: { repository: true, status: true, createdAt: true },
    });
  }

  async countActive(): Promise<number> {
    return prisma.subscription.count({ where: { status: 'ACTIVE' } });
  }

  async groupByRepository() {
    return await prisma.subscription.groupBy({
      by: ['repository'],
      where: { status: 'ACTIVE' },
      _count: { repository: true },
    });
  }
}
