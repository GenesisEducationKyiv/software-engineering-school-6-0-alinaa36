import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { cronScheduler, scanJobQueue } from './adapters/notifier.adapters';
import { ScannerService } from './service/notifier.service';

export default function NotifierModule(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: () => void,
) {
  const scannerService = new ScannerService(
    fastify.subscriptionService,
    cronScheduler,
    scanJobQueue,
  );

  fastify.addHook('onReady', async () => {
    scannerService.start();
  });

  fastify.addHook('onClose', async () => {
    scannerService.stop();
  });

  done();
}
