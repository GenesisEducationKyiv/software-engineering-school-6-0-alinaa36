import { Logger } from '../../lib/logger/logger';
import { ProcessorDeps } from './scanner.type';

export class ScanBatchProcessor {
  constructor(private readonly deps: ProcessorDeps) {}

  async process(repos: string[]): Promise<void> {
    const latestReleases = await this.deps.provider.getLatestReleasesBatch(repos);

    for (const repoName of repos) {
      const newTag = latestReleases[repoName];

      if (!newTag) continue;

      const subscribersToNotify = await this.deps.repository.getOutdatedSubscribers(
        repoName,
        newTag,
      );

      if (subscribersToNotify.length === 0) continue;

      Logger.info(
        `New release for ${repoName}: ${newTag}. Sending ${subscribersToNotify.length} emails.`,
      );

      const results = await Promise.allSettled(
        subscribersToNotify.map(async (sub) => {
          await this.deps.notifier.sendReleaseNotification(
            sub.email,
            repoName,
            newTag,
            sub.unsubscribeToken,
          );
          await this.deps.repository.updateTags([sub.id], newTag);
        }),
      );

      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) {
        Logger.warn(`${failed}/${results.length} notifications failed for ${repoName}`);
      }
    }
  }
}
