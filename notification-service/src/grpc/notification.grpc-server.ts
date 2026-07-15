import * as grpc from '@grpc/grpc-js';
import {
  NotificationServiceService,
  DeliveryStatus,
  type NotificationServiceServer,
  type SendReleaseNotificationRequest,
  type SendReleaseNotificationResponse,
} from '@grn/contracts';
import { Logger } from '../lib/logger/logger';
import { config } from '../lib/config/env.config';
import { redis } from '../lib/redis/redis';
import type { INotifierService } from '../modules/sender/interfaces/notifier.interface';
import type {
  ClaimResult,
  IIdempotencyStore,
} from '../modules/sender/interfaces/idempotency-store.interface';
import { NotifierService } from '../modules/sender/services/mail.service';
import { SmtpProvider } from '../modules/sender/mail.provider';
import { MeteredNotifierService } from '../modules/sender/decorators/notifier.service.metered';
import { RedisIdempotencyStore } from '../modules/sender/adapters/redis-idempotency.store';

function validateRequest(req: SendReleaseNotificationRequest): string | null {
  if (!req.email) return 'email is required';
  if (!req.repo) return 'repo is required';
  if (!req.tag) return 'tag is required';
  if (!req.unsubscribeToken) return 'unsubscribe_token is required';
  if (!req.idempotencyKey) return 'idempotency_key is required';

  return null;
}

export async function handleSendReleaseNotification(
  call: grpc.ServerUnaryCall<SendReleaseNotificationRequest, SendReleaseNotificationResponse>,
  callback: grpc.sendUnaryData<SendReleaseNotificationResponse>,
  notifier: INotifierService,
  idempotency: IIdempotencyStore,
): Promise<void> {
  const req = call.request;

  const validationError = validateRequest(req);
  if (validationError) {
    callback({ code: grpc.status.INVALID_ARGUMENT, message: validationError }, null);

    return;
  }

  let claim: ClaimResult;
  try {
    claim = await idempotency.claim(req.idempotencyKey);
  } catch (err) {
    Logger.error({ err, key: req.idempotencyKey }, '[gRPC] Idempotency store unavailable');
    callback({ code: grpc.status.UNAVAILABLE, message: 'Idempotency store unavailable' }, null);

    return;
  }

  if (claim === 'done') {
    Logger.info({ key: req.idempotencyKey }, '[gRPC] Duplicate release notification, skipping send');
    callback(null, { status: DeliveryStatus.DELIVERY_STATUS_DUPLICATE, message: 'Already delivered' });

    return;
  }

  if (claim === 'in_progress') {
    Logger.info({ key: req.idempotencyKey }, '[gRPC] Release notification already in progress');
    callback({ code: grpc.status.ABORTED, message: 'Delivery already in progress' }, null);

    return;
  }

  try {
    await notifier.sendReleaseNotification({
      email: req.email,
      repo: req.repo,
      tag: req.tag,
      unsubscribeToken: req.unsubscribeToken,
    });
  } catch (err) {
    await idempotency.release(req.idempotencyKey).catch((releaseErr: unknown) => {
      Logger.error({ err: releaseErr, key: req.idempotencyKey }, '[gRPC] Failed to release idempotency key');
    });
    Logger.error({ err, email: req.email }, '[gRPC] Release notification delivery failed');
    callback({ code: grpc.status.INTERNAL, message: 'Failed to send release notification' }, null);

    return;
  }

  await idempotency.confirm(req.idempotencyKey).catch((confirmErr: unknown) => {
    Logger.error({ err: confirmErr, key: req.idempotencyKey }, '[gRPC] Failed to confirm idempotency key');
  });

  Logger.info({ email: req.email, repo: req.repo, tag: req.tag }, '[gRPC] Release notification sent');
  callback(null, { status: DeliveryStatus.DELIVERY_STATUS_SENT, message: 'Sent' });
}

function createHandlers(
  notifier: INotifierService,
  idempotency: IIdempotencyStore,
): NotificationServiceServer {
  return {
    sendReleaseNotification: (call, callback) => {
      void handleSendReleaseNotification(call, callback, notifier, idempotency);
    },
  };
}

export function startNotificationGrpcServer(): Promise<grpc.Server> {
  const notifier: INotifierService = new MeteredNotifierService(
    new NotifierService(new SmtpProvider()),
  );
  const idempotency: IIdempotencyStore = new RedisIdempotencyStore(
    redis,
    config.idempotency.ttlSeconds,
    config.idempotency.leaseSeconds,
  );

  const server = new grpc.Server();
  server.addService(NotificationServiceService, createHandlers(notifier, idempotency));

  const address = `0.0.0.0:${config.grpc.port}`;

  return new Promise((resolve, reject) => {
    server.bindAsync(address, grpc.ServerCredentials.createInsecure(), (err, port) => {
      if (err) {
        reject(err);

        return;
      }

      Logger.info({ port }, '[gRPC] Notification server running');
      resolve(server);
    });
  });
}
