import type { FastifyRequest, FastifyReply } from 'fastify';
import { ValidationError } from '../../../lib/errors/app.error';
import type { SubscribeDto } from '../dtos/subscription.dto';
import type { SubscriptionService } from '../services/subscription.service';

export class SubscriptionController {
  constructor(private subscriptionService: SubscriptionService) {}

  async subscribe(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { email, repo } = request.body as SubscribeDto;
    const subscription = await this.subscriptionService.subscribeToRepo(email, repo);

    return reply.status(201).send({
      status: 'success',
      message: `Будь ласка, перевірте вашу пошту для підтвердження підписки на ${subscription.repository}`,
    });
  }

  async confirm(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { token } = request.params as { token: string };
    const subscription = await this.subscriptionService.confirmSubscription(token);

    return reply.status(200).send({
      status: 'success',
      message: `Успіх! Ви підписалися на оновлення ${subscription.repository}`,
    });
  }

  async unsubscribe(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { token } = request.params as { token: string };
    const subscription = await this.subscriptionService.unsubscribeFromRepo(token);

    return reply.status(200).send({
      status: 'success',
      message: `Ви успішно відписалися від ${subscription.repository}`,
    });
  }

  async getSubscriptions(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { email } = request.query as { email: string };

    if (!email) {
      throw new ValidationError("Параметр email є обов'язковим");
    }

    const subscriptions = await this.subscriptionService.getSubscriptionsByEmail(email);

    return reply.status(200).send({
      status: 'success',
      email,
      subscriptions,
    });
  }
}
