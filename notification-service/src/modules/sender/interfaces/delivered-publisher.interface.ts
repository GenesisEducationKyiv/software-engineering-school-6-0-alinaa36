import type { ReleaseDeliveredEvent } from '@grn/contracts';

export interface IDeliveredPublisher {
  publish(event: ReleaseDeliveredEvent): Promise<void>;
}
