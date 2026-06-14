import type { FastifyInstance } from 'fastify';

export default function SchedulerModule(fastify: FastifyInstance): void {
  fastify.addHook('onReady', async () => {
    fastify.schedulerService.start();
  });

  fastify.addHook('onClose', async () => {
    fastify.schedulerService.stop();
  });
}
