import type {
  IScanQueue,
  IScanQueueSession,
  ScanJobPayload,
} from '../interfaces/scan-queue.interface';
import { createChannel, QUEUE_NAME } from '../../../lib/rabbit/rabbit.channel';

export class RabbitScanQueue implements IScanQueue {
  async open(): Promise<IScanQueueSession> {
    const channel = await createChannel();

    return {
      send: (payload: ScanJobPayload): boolean =>
        channel.sendToQueue(QUEUE_NAME, Buffer.from(JSON.stringify(payload)), {
          persistent: true,
        }),
      close: (): Promise<void> => channel.close(),
    };
  }
}
