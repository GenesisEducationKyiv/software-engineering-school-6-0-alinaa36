import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify/types/instance';
import { FastifyPluginOptions } from 'fastify';
import { SubscriptionService } from '../../subscriptions/services/subscription.service';
import { SubscriptionRepository } from '../../subscriptions/repositories/subscription.repository';
import { GithubService } from '../../github/services/github.service';
import { GithubHttpClient } from '../../github/client/github.client';
import { GithubQueryBuilder } from '../../github/query/github-query.builder';
import { GithubResponseParser } from '../../github/query/github-response.parser';
import { RedisCacheRepository } from '../cache/cache.repository';
import { notifierService } from '../../sender/services/mail.service';

declare module 'fastify' {
  interface FastifyInstance {
    subscriptionService: SubscriptionService;
    githubService: GithubService;
  }
}

export const diPlugin = fp(
  (fastify: FastifyInstance, _opts: FastifyPluginOptions, done: () => void) => {
    const githubService = new GithubService(
      GithubHttpClient.create(),
      new RedisCacheRepository(),
      new GithubQueryBuilder(),
      new GithubResponseParser(),
    );

    const subscriptionService = new SubscriptionService(
      new SubscriptionRepository(),
      githubService,
      notifierService,
    );

    fastify.decorate('githubService', githubService);
    fastify.decorate('subscriptionService', subscriptionService);

    done();
  },
);
