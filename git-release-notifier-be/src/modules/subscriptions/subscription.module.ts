import type { FastifyInstance } from 'fastify';
import { subscriptionRoutes } from './routes/subscription.route';

export default function SubscriptionModule(fastify: FastifyInstance): void {
  fastify.register(subscriptionRoutes);
}
