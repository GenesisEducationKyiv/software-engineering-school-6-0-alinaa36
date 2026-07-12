import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { ScannerService } from './service/notifier.service';
import { Logger } from '../../lib/logger/logger';

export default function NotifierModule(
  fastify: FastifyInstance,
  opts: FastifyPluginOptions,
  done: () => void,
) {
  const scannerService = new ScannerService(fastify.subscriptionService);

  fastify.addHook('onReady', (doneHook) => {
    scannerService.start();
    Logger.info('[NotifierModule] Cron scheduler started.');
    doneHook();
  });

  fastify.addHook('onClose', (instance, doneHook) => {
    if (typeof scannerService.stop === 'function') {
      scannerService.stop();
      Logger.info('[NotifierModule] Cron scheduler gracefully stopped.');
    }
    doneHook();
  });

  done();
}
