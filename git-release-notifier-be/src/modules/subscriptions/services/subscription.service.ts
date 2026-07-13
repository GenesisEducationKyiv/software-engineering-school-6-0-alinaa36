import type { IMetricsGauge } from '../../../lib/metrics/metrics';
import { ConflictError, ErrorCode, NotFoundError } from '../../../lib/errors/app.error';
import type {
  ISubscriptionRepository,
  SubscriptionEntity,
  SubscriptionSummary,
} from '../interfaces/subscription-repository.interface';
import type { INotifierService } from '../../sender/interfaces/notifier.interface';
import type { IRepositoryProvider } from '../interfaces/release-provider.interface';

export class SubscriptionService {
  constructor(
    private readonly subscriptionRepository: ISubscriptionRepository,
    private readonly repoProvider: IRepositoryProvider,
    private readonly notifier: INotifierService,
    private readonly activeGauge: IMetricsGauge,
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

    const subscription = await this.subscriptionRepository.upsertPending(email, repository);
    await this.notifier.sendConfirmationEmail(email, repository, subscription.confirmToken);

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
    await this.syncActiveGauge();

    return updatedSubscription;
  }

  async unsubscribeFromRepo(token: string): Promise<SubscriptionEntity> {
    const subscription = await this.subscriptionRepository.findByUnsubscribeToken(token);

    if (!subscription) {
      throw new NotFoundError(ErrorCode.INVALID_UNSUBSCRIBE_TOKEN);
    }

    const deleted = await this.subscriptionRepository.delete(subscription.id);
    await this.syncActiveGauge();

    return deleted;
  }

  async getSubscriptionsByEmail(email: string): Promise<SubscriptionSummary[]> {
    return this.subscriptionRepository.findByEmail(email);
  }

  async groupByRepository(): Promise<{ repository: string; count: number }[]> {
    return this.subscriptionRepository.groupByRepository();
  }

  private async syncActiveGauge(): Promise<void> {
    const count = await this.subscriptionRepository.countActive();
    this.activeGauge.set(count);
  }
}
