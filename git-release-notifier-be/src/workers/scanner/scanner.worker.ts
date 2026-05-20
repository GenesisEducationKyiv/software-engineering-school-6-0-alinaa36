import { ConsumeMessage } from 'amqplib';
import { Logger } from '../../lib/logger/logger';
import { createChannel, QUEUE_NAME } from '../../lib/rabbit/rabbit.channel';
import { redis } from '../../lib/redis/redis';
import { WorkerConfig } from '../config/worker.config';
import { EmailNotifierAdapter, PrismaSubscriptionAdapter } from './adapters/scanner.adapters';
import { ScanBatchProcessor } from './scanner.processor';
import { ScanJobPayload } from './scanner.type';
import { GithubReleaseSourceProviderAdapter } from './infrastructure/adapters/github-release-source-provider.adapter';
import { createContainer } from '../../modules/common/plugins/container';

const MAX_RETRIES = 3;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function processMessage(
  msg: ConsumeMessage,
  processor: ScanBatchProcessor,
  channel: Awaited<ReturnType<typeof createChannel>>,
): Promise<void> {
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

    await delay(WorkerConfig.RATE_LIMIT_DELAY_MS);
    Logger.info('[Worker] Batch processed successfully.');
  } catch (error) {
    Logger.error({ err: error }, '[Worker] Processing error');

    const retryCount = (msg.properties.headers?.['x-retry-count'] ?? 0) as number;

    if (retryCount >= MAX_RETRIES) {
      Logger.error('[Worker] Retry limit exceeded. Sending to DLQ.');
      channel.nack(msg, false, false);
    } else {
      await delay(WorkerConfig.NACK_RETRY_DELAY_MS);
      channel.nack(msg, false, false);
      channel.sendToQueue(QUEUE_NAME, msg.content, {
        persistent: true,
        headers: {
          ...msg.properties.headers,
          'x-retry-count': retryCount + 1,
        },
      });

      Logger.warn(`[Worker] Retrying batch. Attempt ${retryCount + 1}/${MAX_RETRIES}.`);
    }
  }
}

async function startWorker(): Promise<void> {
  const channel = await createChannel();
  await channel.prefetch(1);

  const { githubReleaseService } = createContainer();

  const processor = new ScanBatchProcessor(
    {
      notifier: new EmailNotifierAdapter(),
      repository: new PrismaSubscriptionAdapter(),
    },
    new GithubReleaseSourceProviderAdapter(githubReleaseService),
  );

  Logger.info('[Worker] Started and ready for work...');

  void channel.consume(
    QUEUE_NAME,
    (msg) => {
      if (!msg) return;

      void processMessage(msg, processor, channel).catch((err) => {
        Logger.error({ err }, '[Worker] Unhandled critical error in message consumer');
        try {
          channel.nack(msg, false, false);
        } catch (nackErr) {
          Logger.error({ err: nackErr }, '[Worker] Failed to nack message during global fallback');
        }
      });
    },
    { noAck: false },
  );
}

startWorker().catch((err) => {
  Logger.error({ err }, '[Worker] Critical startup error');
  process.exit(1);
});
