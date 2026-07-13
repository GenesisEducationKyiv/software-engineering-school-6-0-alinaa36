import { activeSubscriptionsGauge } from '../../../lib/metrics/metrics';
import { ConflictError, NotFoundError } from '../../../lib/errors/app.error';
import type { GithubService } from '../../github/services/github.service';
import type { NotifierService } from '../../sender/services/mail.service';
import type {
  ISubscriptionRepository,
  SubscriptionSummary,
} from '../interfaces/subscription-repository.interface';
import type { Subscription } from '@prisma/client';

export class SubscriptionService {
  constructor(
    private readonly subscriptionRepository: ISubscriptionRepository,
    private readonly githubService: GithubService,
    private readonly notifier: NotifierService,
  ) {}

  async subscribeToRepo(email: string, repository: string): Promise<Subscription> {
    const isAlreadySubscribed = await this.subscriptionRepository.checkIfActiveExists(
      email,
      repository,
    );

    if (isAlreadySubscribed) {
      throw new ConflictError('Ви вже підписані на цей репозиторій');
    }

    const repoData = await this.githubService.getLatestReleasesBatch([repository]);

    if (repoData[repository] === undefined) {
      throw new NotFoundError(`Репозиторій ${repository} не знайдено`);
    }

    const subscription = await this.subscriptionRepository.upsertPending(email, repository);
    await this.notifier.sendConfirmationEmail(email, repository, subscription.confirmToken);

    return subscription;
  }

  async confirmSubscription(token: string): Promise<Subscription> {
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

  async unsubscribeFromRepo(token: string): Promise<Subscription> {
    const subscription = await this.subscriptionRepository.findByUnsubscribeToken(token);

    if (!subscription) {
      throw new NotFoundError('Недійсний токен відписки');
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
    activeSubscriptionsGauge.set(count);
  }
}
