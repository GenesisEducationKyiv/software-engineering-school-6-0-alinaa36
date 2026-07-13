import type { ConsumeMessage } from 'amqplib';
import { Logger } from '../../lib/logger/logger';
import { createChannel, QUEUE_NAME } from '../../lib/rabbit/rabbit.channel';
import { WorkerConfig } from '../config/worker.config';
import { createWorkerContainer } from '../../modules/common/plugins/container.factory';
import type { ScanBatchProcessor } from './scanner.processor';
import type { ILockStore } from './infrastructure/lock/lock-store.interface';
import { delay, handleRetry, parsePayload } from './infrastructure/handlers';

async function processMessage(
  msg: ConsumeMessage,
  processor: ScanBatchProcessor,
  channel: Awaited<ReturnType<typeof createChannel>>,
  lockStore: ILockStore,
): Promise<void> {
  const payload = parsePayload(msg);

  if (!payload) {
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
      await lockStore.unlock(lockKey);
    }

    await delay(WorkerConfig.RATE_LIMIT_DELAY_MS);
    Logger.info('[Worker] Batch processed successfully.');
  } catch (error) {
    Logger.error({ err: error }, '[Worker] Processing error');
    await handleRetry(msg, channel);
  }
}

async function startWorker(): Promise<void> {
  const channel = await createChannel();
  await channel.prefetch(1);

  const { processor, lockStore } = createWorkerContainer();

  Logger.info('[Worker] Started and ready for work...');

  void channel.consume(
    QUEUE_NAME,
    (msg) => {
      if (!msg) return;

      void processMessage(msg, processor, channel, lockStore).catch((err) => {
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
