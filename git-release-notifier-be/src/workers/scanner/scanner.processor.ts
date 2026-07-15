import { Logger } from '../../lib/logger/logger';
import { WorkerConfig } from '../config/worker.config';
import type { ProcessorDeps } from './interfaces/scanner.interfaces';

interface RepoRelease {
  repoName: string;
  newTag: string;
}

export class ScanBatchProcessor {
  constructor(private readonly deps: ProcessorDeps) {}

  async process(repos: string[]): Promise<void> {
    if (repos.length === 0) {
      Logger.warn('[Scanner] Received empty repos batch, skipping');

      return;
    }

    const latestReleases = await this.deps.provider.getLatestReleasesBatch(repos);

    const pending = repos
      .map((repoName) => ({ repoName, newTag: latestReleases[repoName] }))
      .filter((item): item is RepoRelease => Boolean(item.newTag));

    await this.processConcurrently(pending);
  }

  private async processConcurrently(items: RepoRelease[]): Promise<void> {
    let cursor = 0;

    const worker = async (): Promise<void> => {
      while (cursor < items.length) {
        const { repoName, newTag } = items[cursor];
        cursor += 1;
        await this.processRepo(repoName, newTag);
      }
    };

    const size = Math.min(WorkerConfig.REPO_CONCURRENCY, items.length);
    await Promise.all(Array.from({ length: size }, () => worker()));
  }

  private async processRepo(repoName: string, newTag: string): Promise<void> {
    const subscribersToNotify = await this.deps.repository.getOutdatedSubscribers(repoName, newTag);

    if (subscribersToNotify.length === 0) return;

    Logger.info(
      { repo: repoName, tag: newTag, subscribers: subscribersToNotify.length },
      '[Scanner] New release detected, sending notifications',
    );

    const results = await Promise.allSettled(
      subscribersToNotify.map((sub) =>
        this.deps.notifier.sendReleaseNotification({
          email: sub.email,
          repo: repoName,
          tag: newTag,
          unsubscribeToken: sub.unsubscribeToken,
        }),
      ),
    );

    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) {
      Logger.warn(`${failed}/${results.length} enqueue failed for ${repoName}`);
    }
  }
}
