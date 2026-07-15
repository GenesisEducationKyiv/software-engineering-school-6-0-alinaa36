import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Channel, ConsumeMessage } from 'amqplib';

vi.mock('../../lib/logger/logger', () => ({
  Logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { handleRetry, deadLetterInvalid } from '../handlers';
import { ConsumerConfig } from '../email.consumer.config';
import { EMAIL_RETRY_QUEUE_NAME, EMAIL_DEAD_QUEUE_NAME } from '@grn/contracts';

function makeMsg(headers?: Record<string, unknown>): ConsumeMessage {
  return {
    content: Buffer.from('{"type":"confirmation"}'),
    properties: { headers },
    fields: {},
  } as unknown as ConsumeMessage;
}

function makeChannel() {
  return {
    sendToQueue: vi.fn(),
    nack: vi.fn(),
    ack: vi.fn(),
  };
}

describe('handleRetry', () => {
  let channel: ReturnType<typeof makeChannel>;

  beforeEach(() => {
    vi.clearAllMocks();
    channel = makeChannel();
  });

  it('перша невдача: відправляє в retry-чергу з x-retry-count = 1', () => {
    const permanent = handleRetry(makeMsg(), channel as unknown as Channel);

    expect(permanent).toBe(false);
    expect(channel.sendToQueue).toHaveBeenCalledWith(
      EMAIL_RETRY_QUEUE_NAME,
      expect.any(Buffer),
      expect.objectContaining({
        persistent: true,
        headers: expect.objectContaining({ 'x-retry-count': 1 }),
      }),
    );
    expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
  });

  it('інкрементує лічильник спроб з наявного значення', () => {
    handleRetry(makeMsg({ 'x-retry-count': 1 }), channel as unknown as Channel);

    expect(channel.sendToQueue).toHaveBeenCalledWith(
      EMAIL_RETRY_QUEUE_NAME,
      expect.any(Buffer),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-retry-count': 2 }),
      }),
    );
  });

  it('після MAX_RETRIES: переносить у dead-letter чергу й повертає true', () => {
    const permanent = handleRetry(
      makeMsg({ 'x-retry-count': ConsumerConfig.MAX_RETRIES }),
      channel as unknown as Channel,
    );

    expect(permanent).toBe(true);
    expect(channel.sendToQueue).toHaveBeenCalledWith(
      EMAIL_DEAD_QUEUE_NAME,
      expect.any(Buffer),
      expect.objectContaining({ persistent: true }),
    );
    expect(channel.sendToQueue).not.toHaveBeenCalledWith(
      EMAIL_RETRY_QUEUE_NAME,
      expect.anything(),
      expect.anything(),
    );
    expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
  });
});

describe('deadLetterInvalid', () => {
  let channel: ReturnType<typeof makeChannel>;

  beforeEach(() => {
    vi.clearAllMocks();
    channel = makeChannel();
  });

  it('переносить невалідне повідомлення в dead-letter чергу з причиною', () => {
    deadLetterInvalid(makeMsg(), channel as unknown as Channel);

    expect(channel.sendToQueue).toHaveBeenCalledWith(
      EMAIL_DEAD_QUEUE_NAME,
      expect.any(Buffer),
      expect.objectContaining({
        persistent: true,
        headers: expect.objectContaining({ 'x-dead-reason': 'invalid-schema' }),
      }),
    );
  });
});
