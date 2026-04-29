import { prisma } from '../../../lib/prisma';
import { GithubService } from '../../../modules/github/services/github.service';
import { notifierService } from '../../../modules/sender/services/mail.service';
import { ISourceProvider, INotifier, ISubscriptionRepository } from '../scanner.type';

export class GithubReleaseAdapter implements ISourceProvider {
  constructor(private githubService: GithubService) {}
  async getLatestReleasesBatch(repos: string[]) {
    const result = await this.githubService.getLatestReleasesBatch(repos);
    return Object.fromEntries(Object.entries(result).filter(([, value]) => value !== null));
  }
}

export class EmailNotifierAdapter implements INotifier {
  async sendReleaseNotification(email: string, repo: string, tag: string, token: string) {
    await notifierService.sendReleaseNotification(email, repo, tag, token);
  }
}

export class PrismaSubscriptionAdapter implements ISubscriptionRepository {
  async getOutdatedSubscribers(repoName: string, newTag: string) {
    return prisma.subscription.findMany({
      where: {
        repository: repoName,
        status: 'ACTIVE',
        OR: [{ lastSeenTag: { not: newTag } }, { lastSeenTag: null }],
      },
      select: { id: true, email: true, unsubscribeToken: true },
    });
  }

  async updateTags(subscriberIds: string[], newTag: string) {
    await prisma.subscription.updateMany({
      where: { id: { in: subscriberIds } },
      data: { lastSeenTag: newTag },
    });
  }
}
