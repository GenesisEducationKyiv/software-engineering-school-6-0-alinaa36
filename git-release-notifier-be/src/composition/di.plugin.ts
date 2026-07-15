import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { createServerContainer, type ServerContainer } from './containers/server.container';

declare module 'fastify' {
  interface FastifyInstance {
    subscriptionService: ServerContainer['subscriptionService'];
    schedulerService: ServerContainer['schedulerService'];
    subscribeSaga: ServerContainer['subscribeSaga'];
    sagaTimeoutScheduler: ServerContainer['sagaTimeoutScheduler'];
  }
}

export const diPlugin = fp((fastify: FastifyInstance) => {
  const container = createServerContainer();
  fastify.decorate('subscriptionService', container.subscriptionService);
  fastify.decorate('schedulerService', container.schedulerService);
  fastify.decorate('subscribeSaga', container.subscribeSaga);
  fastify.decorate('sagaTimeoutScheduler', container.sagaTimeoutScheduler);
});
