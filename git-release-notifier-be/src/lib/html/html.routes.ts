import type { FastifyInstance } from 'fastify';
import { renderHtml } from './html.renderer';

export async function htmlRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/', (_req, rep) => {
    rep.header('Content-Type', 'text/html; charset=utf-8');

    return rep.send(renderHtml('index.html'));
  });

  fastify.get('/subscriptions', (_req, rep) => {
    rep.header('Content-Type', 'text/html; charset=utf-8');

    return rep.send(renderHtml('subscriptions.html'));
  });

  fastify.get('/api/confirm/:token', async (req, rep) => {
    const { token } = req.params as { token: string };
    const subscription = await fastify.subscriptionService.confirmSubscription(token);

    rep.header('Content-Type', 'text/html; charset=utf-8');

    return rep.send(renderHtml('confirmed.html', { REPO: subscription.repository }));
  });

  fastify.get('/api/unsubscribe/:token', async (req, rep) => {
    const { token } = req.params as { token: string };
    const subscription = await fastify.subscriptionService.unsubscribeFromRepo(token);

    rep.header('Content-Type', 'text/html; charset=utf-8');

    return rep.send(renderHtml('unsubscribed.html', { REPO: subscription.repository }));
  });
}
