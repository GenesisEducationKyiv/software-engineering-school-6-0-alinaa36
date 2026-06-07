import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify/types/instance';
import { createServerContainer, type ServerContainer } from './container.factory';

declare module 'fastify' {
  interface FastifyInstance {
    subscriptionService: ServerContainer['subscriptionService'];
  }
}

export const diPlugin = fp((fastify: FastifyInstance) => {
  const { subscriptionService } = createServerContainer();

  fastify.decorate('subscriptionService', subscriptionService);
});
