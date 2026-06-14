import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { createServerContainer, type ServerContainer } from './container.factory';

declare module 'fastify' {
  interface FastifyInstance {
    subscriptionService: ServerContainer['subscriptionService'];
    schedulerService: ServerContainer['schedulerService'];
  }
}

export const diPlugin = fp((fastify: FastifyInstance) => {
  const container = createServerContainer();
  fastify.decorate('subscriptionService', container.subscriptionService);
  fastify.decorate('schedulerService', container.schedulerService);
});
