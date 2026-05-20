import { prisma } from '../../../lib/prisma';
import { notifierService } from '../../../modules/sender/services/mail.service';
import { INotifier, ISubscriptionRepository } from '../scanner.type';

export class EmailNotifierAdapter implements INotifier {
  async sendReleaseNotification(
    email: string,
    repo: string,
    tag: string,
    token: string,
  ): Promise<void> {
    await notifierService.sendReleaseNotification(email, repo, tag, token);
  }
}

export class PrismaSubscriptionAdapter implements ISubscriptionRepository {
  async getOutdatedSubscribers(
    repoName: string,
    newTag: string,
  ): Promise<Array<{ id: string; email: string; unsubscribeToken: string }>> {
    return await prisma.subscription.findMany({
      where: {
        repository: repoName,
        status: 'ACTIVE',
        OR: [{ lastSeenTag: { not: newTag } }, { lastSeenTag: null }],
      },
      select: { id: true, email: true, unsubscribeToken: true },
    });
  }

  async updateTags(subscriberIds: string[], newTag: string): Promise<void> {
    await prisma.subscription.updateMany({
      where: { id: { in: subscriberIds } },
      data: { lastSeenTag: newTag },
    });
  }
}
