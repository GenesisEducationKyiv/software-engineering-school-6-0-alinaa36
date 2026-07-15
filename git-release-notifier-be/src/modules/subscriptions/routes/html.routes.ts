import type { FastifyInstance } from 'fastify';
import { renderHtml } from '../../../lib/html/html.renderer';
import { HTML_ERROR_MESSAGES } from '../constants/subscription.messages';

export async function htmlRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/', (_req, rep) => {
    rep.header('Content-Type', 'text/html; charset=utf-8');

    return rep.send(renderHtml('index.html'));
  });

  fastify.get('/subscriptions', (_req, rep) => {
    rep.header('Content-Type', 'text/html; charset=utf-8');

    return rep.send(renderHtml('subscriptions.html'));
  });

  fastify.get('/confirm/:token', async (req, rep) => {
    const { token } = req.params as { token: string };
    try {
      const subscription = await fastify.subscriptionService.confirmSubscription(token);
      rep.header('Content-Type', 'text/html; charset=utf-8');

      return rep.send(renderHtml('confirmed.html', { REPO: subscription.repository }));
    } catch {
      rep.header('Content-Type', 'text/html; charset=utf-8');

      return rep
        .status(404)
        .send(renderHtml('error.html', { MESSAGE: HTML_ERROR_MESSAGES.CONFIRM_INVALID }));
    }
  });

  fastify.get('/unsubscribe/:token', async (req, rep) => {
    const { token } = req.params as { token: string };
    try {
      const subscription = await fastify.subscriptionService.unsubscribeFromRepo(token);
      rep.header('Content-Type', 'text/html; charset=utf-8');

      return rep.send(renderHtml('unsubscribed.html', { REPO: subscription.repository }));
    } catch {
      rep.header('Content-Type', 'text/html; charset=utf-8');

      return rep
        .status(404)
        .send(renderHtml('error.html', { MESSAGE: HTML_ERROR_MESSAGES.UNSUBSCRIBE_INVALID }));
    }
  });
}
