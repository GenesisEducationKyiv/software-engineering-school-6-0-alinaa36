import { credentials, Metadata } from '@grpc/grpc-js';
import type { ServiceError } from '@grpc/grpc-js';
import {
  NotificationServiceClient,
  DeliveryStatus,
  releaseIdempotencyKey,
  type SendReleaseNotificationResponse,
} from '@grn/contracts';
import type {
  IConfirmationSender,
  INotifierService,
  ReleaseNotificationPayload,
} from '../interfaces/notifier.interface';
import type { ISubscriptionTagRepository } from '../../subscriptions/interfaces/subscription-repository.interface';

const CALL_TIMEOUT_MS = 30_000;

export class GrpcNotifier implements INotifierService {
  private readonly client: NotificationServiceClient;

  constructor(
    address: string,
    private readonly tagRepository: ISubscriptionTagRepository,
    private readonly confirmationFallback: IConfirmationSender,
  ) {
    this.client = new NotificationServiceClient(address, credentials.createInsecure());
  }

  async sendReleaseNotification(payload: ReleaseNotificationPayload): Promise<void> {
    const response = await this.callServer(payload);

    if (
      response.status === DeliveryStatus.DELIVERY_STATUS_SENT ||
      response.status === DeliveryStatus.DELIVERY_STATUS_DUPLICATE
    ) {
      await this.tagRepository.advanceTag(payload.email, payload.repo, payload.tag);
    }
  }

  sendConfirmationEmail(email: string, repoFullName: string, token: string): Promise<void> {
    return this.confirmationFallback.sendConfirmationEmail(email, repoFullName, token);
  }

  private callServer(
    payload: ReleaseNotificationPayload,
  ): Promise<SendReleaseNotificationResponse> {
    return new Promise((resolve, reject) => {
      this.client.sendReleaseNotification(
        {
          email: payload.email,
          repo: payload.repo,
          tag: payload.tag,
          unsubscribeToken: payload.unsubscribeToken,
          idempotencyKey: releaseIdempotencyKey(payload.email, payload.repo, payload.tag),
        },
        new Metadata(),
        { deadline: Date.now() + CALL_TIMEOUT_MS },
        (err: ServiceError | null, response: SendReleaseNotificationResponse) => {
          if (err) {
            reject(err);

            return;
          }

          resolve(response);
        },
      );
    });
  }
}
