import type { FastifyInstance } from 'fastify';
import { validateBodyZod } from '../../common/middlewares/zod-validator';
import { SubscribeSchema } from '../dtos/subscription.dto';
import { verifyApiKey } from '../../common/middlewares/api-key.middleware';
import { SubscriptionController } from '../controllers/subscription.controller';

export function subscriptionRoutes(fastify: FastifyInstance): void {
  const controller = new SubscriptionController(fastify.subscriptionService);

  const authenticated = { preHandler: [verifyApiKey] };

  fastify.post('/subscribe', { preValidation: [validateBodyZod(SubscribeSchema)] }, (req, rep) =>
    controller.subscribe(req, rep),
  );

  fastify.get('/subscriptions', authenticated, (req, rep) => controller.getSubscriptions(req, rep));

  fastify.get('/confirm', (req, rep) => controller.confirm(req, rep));

  fastify.get('/unsubscribe', (req, rep) => controller.unsubscribe(req, rep));
}
