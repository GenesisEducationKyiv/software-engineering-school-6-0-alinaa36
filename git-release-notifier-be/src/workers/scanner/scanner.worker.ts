import type { ConsumeMessage } from 'amqplib';
import { Logger } from '../../lib/logger/logger';
import { createChannel, QUEUE_NAME, RETRY_QUEUE_NAME } from '../../lib/rabbit/rabbit.channel';
import { WorkerConfig } from '../config/worker.config';
import type { ILockStore } from '../../modules/queue/interfaces/lock-store.interface';
import { delay, handleRetry, parsePayload } from './infrastructure/handlers';
import type { IBatchProcessor } from './interfaces/scanner.interfaces';
import { createWorkerContainer } from '../../composition/containers/worker.container';
import { startDeliveredConsumer } from '../delivered/delivered.consumer';

async function processMessage(
  msg: ConsumeMessage,
  processor: IBatchProcessor,
  channel: Awaited<ReturnType<typeof createChannel>>,
  lockStore: ILockStore,
): Promise<void> {
  const payload = parsePayload(msg);

  if (!payload) {
    Logger.warn(
      { messageId: msg.properties.messageId },
      '[Worker] Invalid message format, discarding',
    );
    channel.ack(msg);

    return;
  }

  const { repos, lockKey, lockToken } = payload;
  Logger.info({ count: repos.length }, '[Worker] Processing repositories');

  try {
    await processor.process(repos);
    channel.ack(msg);

    if (lockKey) {
      await releaseLock(lockStore, lockKey, lockToken);
    }

    await delay(WorkerConfig.RATE_LIMIT_DELAY_MS);
    Logger.info('[Worker] Batch processed successfully.');
  } catch (error) {
    Logger.error({ err: error }, '[Worker] Processing error');
    const permanent = await handleRetry(msg, channel);

    if (permanent && lockKey) {
      await releaseLock(lockStore, lockKey, lockToken);
    }
  }
}

async function releaseLock(lockStore: ILockStore, lockKey: string, token: string): Promise<void> {
  try {
    await lockStore.unlock(lockKey, token);
  } catch (err) {
    Logger.error({ err, lockKey }, '[Worker] Failed to release lock, it will expire via TTL');
  }
}

async function subscribe(processor: IBatchProcessor, lockStore: ILockStore): Promise<void> {
  const channel = await createChannel();
  await channel.prefetch(1);

  await channel.assertQueue(RETRY_QUEUE_NAME, {
    durable: true,
    messageTtl: WorkerConfig.NACK_RETRY_DELAY_MS,
    deadLetterExchange: '',
    deadLetterRoutingKey: QUEUE_NAME,
  });

  channel.on('error', (err) => {
    Logger.error({ err }, '[Worker] Channel error');
  });

  channel.on('close', () => {
    Logger.warn(
      { reconnectDelayMs: WorkerConfig.RECONNECT_DELAY_MS },
      '[Worker] Channel closed, scheduling re-subscribe',
    );
    scheduleReconnect(processor, lockStore);
  });

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

  Logger.info('[Worker] Started and ready for work...');
}

function scheduleReconnect(processor: IBatchProcessor, lockStore: ILockStore): void {
  setTimeout(() => {
    subscribe(processor, lockStore).catch((err) => {
      Logger.error({ err }, '[Worker] Re-subscribe failed, retrying');
      scheduleReconnect(processor, lockStore);
    });
  }, WorkerConfig.RECONNECT_DELAY_MS);
}

async function startWorker(): Promise<void> {
  const { processor, lockStore, tagRepository } = createWorkerContainer();

  await startDeliveredConsumer(tagRepository);
  await subscribe(processor, lockStore);
}

startWorker().catch((err) => {
  Logger.error({ err }, '[Worker] Critical startup error');
  process.exit(1);
});