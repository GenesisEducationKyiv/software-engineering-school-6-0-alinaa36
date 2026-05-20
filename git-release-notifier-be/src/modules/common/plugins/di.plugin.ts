import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify/types/instance';
import { FastifyPluginOptions } from 'fastify';
import { SubscriptionService } from '../../subscriptions/services/subscription.service';
import { SubscriptionRepository } from '../../subscriptions/repositories/subscription.repository';
import { notifierService } from '../../sender/services/mail.service';
import { createContainer } from './container';
import { GitHubRepoProviderAdapter } from '../../subscriptions/infrastructure/adapters/git-hub-repo-provider.adapter';

declare module 'fastify' {
  interface FastifyInstance {
    subscriptionService: SubscriptionService;
  }
}

export const diPlugin = fp(
  (fastify: FastifyInstance, _opts: FastifyPluginOptions, done: () => void) => {
    const { githubReleaseService } = createContainer();

    const githubRepoProviderAdapter = new GitHubRepoProviderAdapter(githubReleaseService);

    const subscriptionService = new SubscriptionService(
      new SubscriptionRepository(),
      githubRepoProviderAdapter,
      notifierService,
    );

    fastify.decorate('subscriptionService', subscriptionService);

    done();
  },
);
