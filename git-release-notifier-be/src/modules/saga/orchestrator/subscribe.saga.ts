import { confirmationIdempotencyKey, type ConfirmationReply } from '@grn/contracts';
import { Logger } from '../../../lib/logger/logger';
import type { IEmailQueue } from '../../sender/interfaces/email-queue.interface';
import type {
  ISubscriptionRepository,
  SubscriptionEntity,
} from '../../subscriptions/interfaces/subscription-repository.interface';
import { SUBSCRIBE_SAGA_TYPE, SagaState } from '../constants/saga.constants';
import type { ISagaRepository, SagaRecord } from '../interfaces/saga-repository.interface';
import type { ISubscribeSaga } from '../interfaces/subscribe-saga.interface';

export class SubscribeSaga implements ISubscribeSaga {
  constructor(
    private readonly sagaRepository: ISagaRepository,
    private readonly subscriptionRepository: ISubscriptionRepository,
    private readonly emailQueue: IEmailQueue,
  ) {}

  async start(email: string, repository: string): Promise<SubscriptionEntity> {
    const subscription = await this.subscriptionRepository.upsertPending(email, repository);
    const saga = await this.sagaRepository.create(SUBSCRIBE_SAGA_TYPE, {
      subscriptionId: subscription.id,
      email,
      repo: repository,
    });

    await this.emailQueue.publish({
      type: 'confirmation',
      idempotencyKey: confirmationIdempotencyKey(email, repository, subscription.confirmToken),
      email,
      repo: repository,
      confirmToken: subscription.confirmToken,
      sagaId: saga.id,
    });
    await this.sagaRepository.updateState(saga.id, SagaState.AWAITING_EMAIL);
    Logger.info({ sagaId: saga.id, email, repo: repository }, '[Saga] Subscribe saga started');

    return subscription;
  }

  async onReply(reply: ConfirmationReply): Promise<void> {
    const saga = await this.sagaRepository.findById(reply.sagaId);

    if (!saga || saga.state !== SagaState.AWAITING_EMAIL) {
      return;
    }

    if (reply.status === 'SENT') {
      await this.sagaRepository.updateState(saga.id, SagaState.COMPLETED);
      Logger.info({ sagaId: saga.id }, '[Saga] Subscribe saga completed');

      return;
    }

    await this.compensate(saga, reply.reason);
  }

  async compensateStuck(timeoutMs: number): Promise<void> {
    const threshold = new Date(Date.now() - timeoutMs);
    const stuck = await this.sagaRepository.findStuck(SagaState.AWAITING_EMAIL, threshold);

    for (const saga of stuck) {
      Logger.warn({ sagaId: saga.id }, '[Saga] Confirmation reply timed out, compensating');
      await this.compensate(saga, 'confirmation reply timed out');
    }
  }

  private async compensate(saga: SagaRecord, reason?: string): Promise<void> {
    await this.sagaRepository.updateState(saga.id, SagaState.COMPENSATING, reason);
    await this.removePendingSubscription(saga.payload.subscriptionId);
    await this.sagaRepository.updateState(saga.id, SagaState.COMPENSATED, reason);
    Logger.warn({ sagaId: saga.id, reason }, '[Saga] Subscribe saga compensated');
  }

  private async removePendingSubscription(subscriptionId: string): Promise<void> {
    try {
      await this.subscriptionRepository.delete(subscriptionId);
    } catch (err) {
      Logger.error(
        { err, subscriptionId },
        '[Saga] Failed to delete pending subscription during compensation',
      );
    }
  }
}
