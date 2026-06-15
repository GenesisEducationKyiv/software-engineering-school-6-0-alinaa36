import { Logger } from './lib/logger/logger';
import { startEmailConsumer, stopEmailConsumer } from './consumer/email.consumer';
import { startMetricsServer } from './lib/metrics/metrics.server';
import { closeRabbitConnection } from './lib/rabbit/rabbit.connection';
import { closeRedis } from './lib/redis/redis';

async function main(): Promise<void> {
  const metricsServer = startMetricsServer();
  await startEmailConsumer();

  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    Logger.info({ signal }, '[notification-service] Shutting down');

    await stopEmailConsumer();
    await closeRabbitConnection();
    await closeRedis();
    await new Promise<void>((resolve) => metricsServer.close(() => resolve()));

    Logger.info('[notification-service] Shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  Logger.error({ err }, '[notification-service] Critical startup error');
  process.exit(1);
});
