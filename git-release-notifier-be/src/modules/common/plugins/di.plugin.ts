import fp from 'fastify-plugin';
import { SubscriptionService } from '../../subscriptions/services/subscription.service';
import { SubscriptionRepository } from '../../subscriptions/repositories/subscription.repository';
import { GithubService } from '../../github/services/github.service'; // Додай цей імпорт
import { FastifyInstance } from 'fastify/types/instance';

declare module 'fastify' {
  interface FastifyInstance {
    subscriptionService: SubscriptionService;
    githubService: GithubService;
  }
}

// eslint-disable-next-line @typescript-eslint/require-await
export const diPlugin = fp(async (fastify: FastifyInstance) => {
  // 1. СТВОРЮЄМО GITHUB SERVICE ТУТ
  const githubService = new GithubService();

  // 2. Створюємо репозиторій
  const subscriptionRepository = new SubscriptionRepository();

  // 3. Збираємо SubscriptionService докупи
  const subscriptionService = new SubscriptionService(
    subscriptionRepository,
    githubService, // ✅ Тепер це 100% реальний об'єкт, а не undefined!
  );

  // 4. Декоруємо Fastify (щоб вони були доступні в роутах)
  fastify.decorate('githubService', githubService);
  fastify.decorate('subscriptionService', subscriptionService);
});
