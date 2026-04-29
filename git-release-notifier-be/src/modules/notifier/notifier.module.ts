import { FastifyInstance } from 'fastify';
import { ScannerService } from './service/notifier.service';
import { Logger } from '../../lib/logger/logger';

export default async function NotifierModule(fastify: FastifyInstance) {
  const scannerService = new ScannerService(fastify.subscriptionService);

  fastify.addHook('onReady', async () => {
    scannerService.start();
    Logger.info('[NotifierModule] Cron scheduler started.');
  });

  fastify.addHook('onClose', async () => {
    if (typeof scannerService.stop === 'function') {
      scannerService.stop();
      Logger.info('[NotifierModule] Cron scheduler gracefully stopped.');
    }
  });
}
