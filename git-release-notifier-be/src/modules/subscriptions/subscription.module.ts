import { FastifyInstance } from 'fastify';
import { subscriptionRoutes } from './routes/subscription.route';

export default async function SubscriptionModule(fastify: FastifyInstance): Promise<void> {
  await fastify.register(subscriptionRoutes);
}
