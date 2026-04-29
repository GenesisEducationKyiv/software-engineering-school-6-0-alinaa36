import { SubscriptionRepository } from '../repositories/subscription.repository';
import { notifierService } from '../../sender/services/mail.service';
import { activeSubscriptionsGauge } from '../../../lib/metrics/metrics';
import { ConflictError, NotFoundError } from '../../../lib/errors/app.error';
import { GithubService } from '../../github/services/github.service';

export class SubscriptionService {
  constructor(
    private subscriptionRepository: SubscriptionRepository,
    private githubService: GithubService,
  ) {}

  async subscribeToRepo(email: string, repository: string) {
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
    await notifierService.sendConfirmationEmail(
      email,
      repository,
      subscription.confirmToken as string,
    );

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

    const activeCount = await this.subscriptionRepository.countActive();
    activeSubscriptionsGauge.set(activeCount);

    return updatedSubscription;
  }

  async unsubscribeFromRepo(token: string) {
    const subscription = await this.subscriptionRepository.findByUnsubscribeToken(token);

    if (!subscription) {
      throw new NotFoundError('Недійсний токен підтвердження');
    }

    const deleted = await this.subscriptionRepository.delete(subscription.id);

    const activeCount = await this.subscriptionRepository.countActive();

    activeSubscriptionsGauge.set(activeCount);

    return deleted;
  }

  async getSubscriptionsByEmail(email: string) {
    return await this.subscriptionRepository.findByEmail(email);
  }

  async groupByRepository() {
    return await this.subscriptionRepository.groupByRepository();
  }
}
