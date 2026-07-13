import { prisma } from '../../../lib/prisma';
import type { GithubService } from '../../../modules/github/services/github.service';
import type { BatchReleaseResult } from '../../../modules/github/types/github-info.type';
import { notifierService } from '../../../modules/sender/services/mail.service';
import type {
  ISourceProvider,
  INotifier,
  ISubscriptionRepository,
} from '../interfaces/scanner.interfaces';
import type { ReleaseNotificationPayload, OutdatedSubscriber } from '../types/scanner.type';

export class GithubReleaseAdapter implements ISourceProvider {
  constructor(private githubService: GithubService) {}

  async getLatestReleasesBatch(repos: string[]): Promise<BatchReleaseResult> {
    const result = await this.githubService.getLatestReleasesBatch(repos);

    return Object.fromEntries(Object.entries(result).filter(([, value]) => value !== null));
  }
}

export class EmailNotifierAdapter implements INotifier {
  async sendReleaseNotification(payload: ReleaseNotificationPayload): Promise<void> {
    const { email, repo, tag, unsubscribeToken } = payload;
    await notifierService.sendReleaseNotification(email, repo, tag, unsubscribeToken);
  }
}

export class PrismaSubscriptionAdapter implements ISubscriptionRepository {
  async getOutdatedSubscribers(
    repoName: string,
    newTag: string,
  ): Promise<Array<OutdatedSubscriber>> {
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
