import type { Channel, ConsumeMessage } from "amqplib";
import { Logger } from "../lib/logger/logger";
import { config } from "../lib/config/env.config";
import { createChannel } from "../lib/rabbit/rabbit.channel";
import {
  EMAIL_QUEUE_NAME,
  EMAIL_RETRY_QUEUE_NAME,
  EMAIL_DEAD_QUEUE_NAME,
  emailMessageSchema,
  type EmailMessage,
} from "@grn/contracts";
import { ConsumerConfig } from "./email.consumer.config";
import { handleRetry, deadLetterInvalid } from "./handlers";
import type { INotifierService } from "../modules/sender/interfaces/notifier.interface";
import { NotifierService } from "../modules/sender/services/mail.service";
import { SmtpProvider } from "../modules/sender/mail.provider";
import { MeteredNotifierService } from "../modules/sender/decorators/notifier.service.metered";
import type {
  ClaimResult,
  IIdempotencyStore,
} from "../modules/sender/interfaces/idempotency-store.interface";
import { RedisIdempotencyStore } from "../modules/sender/adapters/redis-idempotency.store";
import type { IDeliveredPublisher } from "../modules/sender/interfaces/delivered-publisher.interface";
import { RabbitDeliveredPublisher } from "../modules/sender/adapters/rabbit-delivered-publisher";
import type { IConfirmationReplyPublisher } from "../modules/sender/interfaces/confirmation-reply-publisher.interface";
import { RabbitConfirmationReplyPublisher } from "../modules/sender/adapters/rabbit-confirmation-reply.publisher";
import { redis } from "../lib/redis/redis";

export type ConsumerDeps = {
  notifier: INotifierService;
  idempotency: IIdempotencyStore;
  deliveredPublisher: IDeliveredPublisher;
};

const deps: ConsumerDeps = {
  notifier: new MeteredNotifierService(new NotifierService(new SmtpProvider())),
  idempotency: new RedisIdempotencyStore(
    redis,
    config.idempotency.ttlSeconds,
    config.idempotency.leaseSeconds,
  ),
  deliveredPublisher: new RabbitDeliveredPublisher(),
};

const replyPublisher: IConfirmationReplyPublisher =
  new RabbitConfirmationReplyPublisher();

let channel: Channel | null = null;
let consumerTag: string | null = null;
let shuttingDown = false;
let inFlight = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function parseMessage(msg: ConsumeMessage): EmailMessage | null {
  try {
    const parsed = JSON.parse(msg.content.toString()) as unknown;

    return emailMessageSchema.parse(parsed);
  } catch (err) {
    Logger.warn({ err }, "[Consumer] Invalid email message, discarding");

    return null;
  }
}

async function deliver(
  message: EmailMessage,
  { notifier }: ConsumerDeps,
): Promise<void> {
  if (message.type === "release") {
    await notifier.sendReleaseNotification({
      email: message.email,
      repo: message.repo,
      tag: message.tag,
      unsubscribeToken: message.unsubscribeToken,
    });

    return;
  }

  await notifier.sendConfirmationEmail(
    message.email,
    message.repo,
    message.confirmToken,
  );
}

async function confirmDelivery(
  message: EmailMessage,
  { deliveredPublisher }: ConsumerDeps,
): Promise<void> {
  if (message.type === "release") {
    await deliveredPublisher.publish({
      email: message.email,
      repo: message.repo,
      tag: message.tag,
    });

    return;
  }

  if (message.sagaId) {
    await replyPublisher.publish({ sagaId: message.sagaId, status: "SENT" });
  }

  if (message.sagaId) {
    await replyPublisher.publish({ sagaId: message.sagaId, status: "SENT" });
  }
}

async function publishSagaFailure(
  message: EmailMessage,
  error: unknown,
): Promise<void> {
  if (message.type !== "confirmation" || !message.sagaId) return;

  try {
    await replyPublisher.publish({
      sagaId: message.sagaId,
      status: "FAILED",
      reason: error instanceof Error ? error.message : "delivery failed",
    });
    Logger.warn(
      { sagaId: message.sagaId },
      "[Consumer] Confirmation permanently failed, saga compensation requested",
    );
  } catch (err) {
    Logger.error(
      { err, sagaId: message.sagaId },
      "[Consumer] Failed to publish saga failure reply",
    );
  }
}

export async function processMessage(
  msg: ConsumeMessage,
  ch: Channel,
  consumerDeps: ConsumerDeps,
): Promise<void> {
  const { idempotency } = consumerDeps;
  const message = parseMessage(msg);

  if (!message) {
    deadLetterInvalid(msg, ch);
    ch.ack(msg);

    return;
  }

  let claim: ClaimResult;
  try {
    claim = await idempotency.claim(message.idempotencyKey);
  } catch (err) {
    Logger.error(
      { err, key: message.idempotencyKey },
      "[Consumer] Idempotency store unavailable, requeueing",
    );
    handleRetry(msg, ch);

    return;
  }

  if (claim === "done") {
    try {
      await confirmDelivery(message, consumerDeps);
      ch.ack(msg);
      Logger.info(
        { type: message.type, key: message.idempotencyKey },
        "[Consumer] Duplicate message detected, skipping send",
      );
    } catch (err) {
      Logger.error(
        { err, key: message.idempotencyKey },
        "[Consumer] Failed to re-confirm delivery for duplicate, requeueing",
      );
      handleRetry(msg, ch);
    }

    return;
  }

  if (claim === "in_progress") {
    Logger.info(
      { type: message.type, key: message.idempotencyKey },
      "[Consumer] Delivery already in progress, requeueing",
    );
    handleRetry(msg, ch);

    return;
  }

  try {
    await deliver(message, consumerDeps);
  } catch (error) {
    await idempotency.release(message.idempotencyKey).catch((err: unknown) => {
      Logger.error(
        { err, key: message.idempotencyKey },
        "[Consumer] Failed to release idempotency key after delivery failure",
      );
    });
    Logger.error(
      { err: error, type: message.type },
      "[Consumer] Delivery failed",
    );
    const deadLettered = handleRetry(msg, ch);

    if (deadLettered) {
      await publishSagaFailure(message, error);
    }

    return;
  }

  await idempotency.confirm(message.idempotencyKey).catch((err: unknown) => {
    Logger.error(
      { err, key: message.idempotencyKey },
      "[Consumer] Failed to confirm idempotency key after delivery",
    );
  });

  try {
    await confirmDelivery(message, consumerDeps);
    ch.ack(msg);
    Logger.info(
      { type: message.type, email: message.email },
      "[Consumer] Email sent",
    );
  } catch (err) {
    Logger.error(
      { err, key: message.idempotencyKey },
      "[Consumer] Email sent but delivery confirmation failed, requeueing",
    );
    handleRetry(msg, ch);
  }
}

function onMessage(msg: ConsumeMessage | null, ch: Channel): void {
  if (!msg) return;

  inFlight += 1;
  void processMessage(msg, ch, deps)
    .catch((err) => {
      Logger.error({ err }, "[Consumer] Unhandled critical error");
      try {
        ch.nack(msg, false, false);
      } catch (nackErr) {
        Logger.error(
          { err: nackErr },
          "[Consumer] Failed to nack during fallback",
        );
      }
    })
    .finally(() => {
      inFlight -= 1;
    });
}

async function setupConsumer(): Promise<void> {
  const ch = await createChannel();
  await ch.prefetch(1);

  await ch.assertQueue(EMAIL_RETRY_QUEUE_NAME, {
    durable: true,
    messageTtl: ConsumerConfig.RETRY_DELAY_MS,
    deadLetterExchange: "",
    deadLetterRoutingKey: EMAIL_QUEUE_NAME,
  });
  await ch.assertQueue(EMAIL_DEAD_QUEUE_NAME, { durable: true });

  ch.on("error", (err) => {
    Logger.error({ err }, "[Consumer] Channel error");
  });

  ch.on("close", () => {
    if (shuttingDown) return;
    Logger.warn("[Consumer] Channel closed, scheduling re-subscribe");
    channel = null;
    consumerTag = null;
    scheduleReconnect();
  });

  const { consumerTag: tag } = await ch.consume(
    EMAIL_QUEUE_NAME,
    (msg) => onMessage(msg, ch),
    {
      noAck: false,
    },
  );

  channel = ch;
  consumerTag = tag;
  Logger.info("[Consumer] Started and ready for work...");
}

function scheduleReconnect(): void {
  if (shuttingDown) return;
  if (reconnectTimer) return;

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (shuttingDown) return;

    setupConsumer().catch((err) => {
      Logger.error({ err }, "[Consumer] Re-subscribe failed, retrying");
      scheduleReconnect();
    });
  }, config.consumer.reconnectDelayMs);
}

export async function startEmailConsumer(): Promise<void> {
  try {
    await setupConsumer();
  } catch (err) {
    Logger.error({ err }, "[Consumer] Initial setup failed, scheduling retry");
    scheduleReconnect();
  }
}

export async function stopEmailConsumer(): Promise<void> {
  shuttingDown = true;

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (channel && consumerTag) {
    try {
      await channel.cancel(consumerTag);
    } catch (err) {
      Logger.error({ err }, "[Consumer] Failed to cancel consumer");
    }
  }

  const deadline = Date.now() + config.consumer.shutdownTimeoutMs;
  while (inFlight > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  if (channel) {
    try {
      await channel.close();
    } catch (err) {
      Logger.error({ err }, "[Consumer] Failed to close channel");
    }
    channel = null;
    consumerTag = null;
  }

  Logger.info({ inFlight }, "[Consumer] Stopped");
}
