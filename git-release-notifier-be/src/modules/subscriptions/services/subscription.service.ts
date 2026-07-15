import { ConflictError, ErrorCode, NotFoundError } from '../../../lib/errors/app.error';
import type {
  ISubscriptionRepository,
  SubscriptionEntity,
  SubscriptionSummary,
} from '../interfaces/subscription-repository.interface';
import type { IRepositoryProvider } from '../interfaces/release-provider.interface';
import type { ISubscriptionService } from '../interfaces/subscription-service.interface';
import type { ISubscribeSaga } from '../../saga/interfaces/subscribe-saga.interface';
import { Logger } from '../../../lib/logger/logger';

export class SubscriptionService implements ISubscriptionService {
  constructor(
    private readonly subscriptionRepository: ISubscriptionRepository,
    private readonly repoProvider: IRepositoryProvider,
    private readonly subscribeSaga: ISubscribeSaga,
  ) {}

  async subscribeToRepo(email: string, repository: string): Promise<SubscriptionEntity> {
    const isAlreadySubscribed = await this.subscriptionRepository.checkIfActiveExists(
      email,
      repository,
    );

    if (isAlreadySubscribed) {
      throw new ConflictError(ErrorCode.ALREADY_SUBSCRIBED);
    }

    const exists = await this.repoProvider.exists(repository);

    if (!exists) {
      throw new NotFoundError(ErrorCode.REPOSITORY_NOT_FOUND);
    }

    const subscription = await this.subscribeSaga.start(email, repository);
    Logger.info({ email, repo: repository }, '[Subscription] Pending subscription created');

    return subscription;
  }

  async confirmSubscription(token: string): Promise<SubscriptionEntity> {
    const subscription = await this.subscriptionRepository.findByConfirmToken(token);

    if (!subscription) {
      throw new NotFoundError(ErrorCode.INVALID_CONFIRM_TOKEN);
    }

    if (subscription.status === 'ACTIVE') {
      throw new ConflictError(ErrorCode.ALREADY_SUBSCRIBED);
    }

    const updatedSubscription = await this.subscriptionRepository.activate(subscription.id);
    Logger.info('[Subscription] Subscription confirmed');

    return updatedSubscription;
  }

  async unsubscribeFromRepo(token: string): Promise<SubscriptionEntity> {
    const subscription = await this.subscriptionRepository.findByUnsubscribeToken(token);

    if (!subscription) {
      throw new NotFoundError(ErrorCode.INVALID_UNSUBSCRIBE_TOKEN);
    }

    const deleted = await this.subscriptionRepository.delete(subscription.id);
    Logger.info('[Subscription] Unsubscribed successfully');

    return deleted;
  }

  async getSubscriptionsByEmail(email: string): Promise<SubscriptionSummary[]> {
    return this.subscriptionRepository.findByEmail(email);
  }

  async groupByRepository(): Promise<{ repository: string; count: number }[]> {
    return this.subscriptionRepository.groupByRepository();
  }
}
