import type { FastifyInstance } from 'fastify';
import { createSchedulerService } from '../common/plugins/container.factory';

export default function SchedulerModule(fastify: FastifyInstance): void {
  const schedulerService = createSchedulerService(fastify.subscriptionService);

  fastify.addHook('onReady', async () => {
    schedulerService.start();
  });

  fastify.addHook('onClose', async () => {
    schedulerService.stop();
  });
}
