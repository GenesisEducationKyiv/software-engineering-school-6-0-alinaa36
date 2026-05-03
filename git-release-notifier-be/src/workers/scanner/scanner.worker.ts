import { Logger } from '../../lib/logger/logger';
import { createChannel, QUEUE_NAME } from '../../lib/rabbit/rabbit.channel';
import { redis } from '../../lib/redis/redis';
import { GithubService } from '../../modules/github/services/github.service';
import { WorkerConfig } from '../config/worker.config';
import {
  GithubReleaseAdapter,
  EmailNotifierAdapter,
  PrismaSubscriptionAdapter,
} from './adapters/scanner.adapters';
import { ScanBatchProcessor } from './scanner.processor';
import { ScanJobPayload } from './scanner.type';

async function startWorker(): Promise<void> {
  const channel = await createChannel();
  await channel.prefetch(1);

  const processor = new ScanBatchProcessor({
    provider: new GithubReleaseAdapter(new GithubService()),
    notifier: new EmailNotifierAdapter(),
    repository: new PrismaSubscriptionAdapter(),
  });

  Logger.info('[Worker] Started and ready for work...');

  void channel.consume(
    QUEUE_NAME,
    (msg) => {
      void (async () => {
        if (!msg) {
          return;
        }

        let payload: ScanJobPayload;

        try {
          payload = JSON.parse(msg.content.toString()) as ScanJobPayload;
        } catch {
          Logger.error('[Worker] Invalid message format. Discarding.');
          channel.ack(msg);
          return;
        }

        const { repos, lockKey } = payload;
        Logger.info(`[Worker] Processing ${repos.length} repositories...`);

        try {
          await processor.process(repos);

          channel.ack(msg);

          if (lockKey) {
            await redis.del(lockKey);
            Logger.info(`[Redis] Lock ${lockKey} released.`);
          }

          await new Promise((resolve) => setTimeout(resolve, WorkerConfig.RATE_LIMIT_DELAY_MS));

          Logger.info('[Worker] Batch processed successfully.');
        } catch (error) {
          Logger.error({ err: error }, '[Worker] Processing error');

          const retryCount = (msg.properties.headers?.['x-retry-count'] ?? 0) as number;
          const MAX_RETRIES = 3;

          if (retryCount >= MAX_RETRIES) {
            Logger.error('[Worker] Retry limit exceeded for batch. Sending to DLQ.');
            channel.nack(msg, false, false);
          } else {
            await new Promise((resolve) => setTimeout(resolve, WorkerConfig.NACK_RETRY_DELAY_MS));
            channel.nack(msg, false, true);
          }
        }
      })();
    },
    { noAck: false },
  );
}

startWorker().catch((err) => {
  Logger.error({ err }, '[Worker] Critical startup error');
  process.exit(1);
});
