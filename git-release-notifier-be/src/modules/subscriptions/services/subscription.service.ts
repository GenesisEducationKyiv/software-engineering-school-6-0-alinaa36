import { activeSubscriptionsGauge } from '../../../lib/metrics/metrics';
import { ConflictError, NotFoundError } from '../../../lib/errors/app.error';
import { NotifierService } from '../../sender/services/mail.service';
import { ISubscriptionRepository, IRepositoryProvider } from '../interfaces';

export class SubscriptionService {
  constructor(
    private readonly subscriptionRepository: ISubscriptionRepository,
    private readonly repositoryProvider: IRepositoryProvider,
    private readonly notifier: NotifierService,
  ) {}

  async subscribeToRepo(email: string, repository: string) {
    const isAlreadySubscribed = await this.subscriptionRepository.checkIfActiveExists(
      email,
      repository,
    );

    if (isAlreadySubscribed) {
      throw new ConflictError('Ви вже підписані на цей репозиторій');
    }

    const repoData = await this.repositoryProvider.exists(repository);

    if (!repoData) {
      throw new NotFoundError(`Репозиторій ${repository} не знайдено`);
    }

    const subscription = await this.subscriptionRepository.upsertPending(email, repository);
    await this.notifier.sendConfirmationEmail(email, repository, subscription.confirmToken);

    return subscription;
  }

  async confirmSubscription(token: string) {
    const subscription = await this.subscriptionRepository.findByConfirmToken(token);

    if (!subscription) {
      throw new NotFoundError('Недійсний токен підтвердження');
    }

    if (subscription.status === 'ACTIVE') {
      throw new ConflictError('Ви вже підписані на цей репозиторій');
    }

    const updatedSubscription = await this.subscriptionRepository.activate(subscription.id);
    await this.syncActiveGauge();

    return updatedSubscription;
  }

  async unsubscribeFromRepo(token: string) {
    const subscription = await this.subscriptionRepository.findByUnsubscribeToken(token);

    if (!subscription) {
      throw new NotFoundError('Недійсний токен відписки');
    }

    const deleted = await this.subscriptionRepository.delete(subscription.id);
    await this.syncActiveGauge();

    return deleted;
  }

  async getSubscriptionsByEmail(email: string) {
    return this.subscriptionRepository.findByEmail(email);
  }

  async groupByRepository() {
    return this.subscriptionRepository.groupByRepository();
  }

  private async syncActiveGauge(): Promise<void> {
    const count = await this.subscriptionRepository.countActive();
    activeSubscriptionsGauge.set(count);
  }
}
