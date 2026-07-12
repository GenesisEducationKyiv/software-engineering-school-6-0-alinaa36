import fp from 'fastify-plugin';
import { SubscriptionService } from '../../subscriptions/services/subscription.service';
import { SubscriptionRepository } from '../../subscriptions/repositories/subscription.repository';
import { GithubService } from '../../github/services/github.service'; // Додай цей імпорт
import { FastifyInstance } from 'fastify/types/instance';
import { FastifyPluginOptions } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    subscriptionService: SubscriptionService;
    githubService: GithubService;
  }
}

export const diPlugin = fp(
  (fastify: FastifyInstance, opts: FastifyPluginOptions, done: () => void) => {
    const githubService = new GithubService();

    const subscriptionRepository = new SubscriptionRepository();

    const subscriptionService = new SubscriptionService(subscriptionRepository, githubService);

    fastify.decorate('githubService', githubService);
    fastify.decorate('subscriptionService', subscriptionService);

    done();
  },
);
