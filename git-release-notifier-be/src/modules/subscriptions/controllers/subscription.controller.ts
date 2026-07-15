import type { FastifyRequest, FastifyReply } from 'fastify';
import { ErrorCode, ValidationError } from '../../../lib/errors/app.error';
import type { SubscribeDto } from '../dtos/subscription.dto';
import type { ISubscriptionService } from '../interfaces/subscription-service.interface';
import { HTTP_MESSAGES } from '../constants/subscription.messages';

export class SubscriptionController {
  constructor(private subscriptionService: ISubscriptionService) {}

  async subscribe(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { email, repo } = request.body as SubscribeDto;
    const subscription = await this.subscriptionService.subscribeToRepo(email, repo);

    return reply.status(201).send({
      status: 'success',
      message: HTTP_MESSAGES.SUBSCRIBE_PENDING(subscription.repository),
    });
  }

  async confirm(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { token } = request.params as { token: string };
    const subscription = await this.subscriptionService.confirmSubscription(token);

    return reply.status(200).send({
      status: 'success',
      message: HTTP_MESSAGES.CONFIRM_SUCCESS(subscription.repository),
    });
  }

  async unsubscribe(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { token } = request.params as { token: string };
    const subscription = await this.subscriptionService.unsubscribeFromRepo(token);

    return reply.status(200).send({
      status: 'success',
      message: HTTP_MESSAGES.UNSUBSCRIBE_SUCCESS(subscription.repository),
    });
  }

  async getSubscriptions(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { email } = request.query as { email: string };

    if (!email) {
      throw new ValidationError(ErrorCode.EMAIL_REQUIRED);
    }

    const subscriptions = await this.subscriptionService.getSubscriptionsByEmail(email);

    return reply.status(200).send({
      status: 'success',
      email,
      subscriptions,
    });
  }
}
