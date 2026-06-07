import { Logger } from '../../lib/logger/logger';
import type { ProcessorDeps } from './interfaces/scanner.interfaces';

export class ScanBatchProcessor {
  constructor(private readonly deps: ProcessorDeps) {}

  async process(repos: string[]): Promise<void> {
    const latestReleases = await this.deps.provider.getLatestReleasesBatch(repos);

    for (const repoName of repos) {
      const newTag = latestReleases[repoName];
      if (!newTag) continue;

      await this.processRepo(repoName, newTag);
    }
  }

  private async processRepo(repoName: string, newTag: string): Promise<void> {
    const subscribersToNotify = await this.deps.repository.getOutdatedSubscribers(repoName, newTag);

    if (subscribersToNotify.length === 0) return;

    Logger.info(
      { repo: repoName, tag: newTag, subscribers: subscribersToNotify.length },
      '[Scanner] New release detected, sending notifications',
    );

    const results = await Promise.allSettled(
      subscribersToNotify.map(async (sub) => {
        await this.deps.notifier.sendReleaseNotification({
          email: sub.email,
          repo: repoName,
          tag: newTag,
          unsubscribeToken: sub.unsubscribeToken,
        });
        await this.deps.repository.updateTags([sub.id], newTag);
      }),
    );

    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) {
      Logger.warn(`${failed}/${results.length} notifications failed for ${repoName}`);
    }
  }
}
