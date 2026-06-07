import type { ScanJobPayload } from '../../../workers/scanner/types/scanner.type';

export interface IScanQueueSession {
  send(payload: ScanJobPayload): boolean;
  close(): Promise<void>;
}

export interface IScanQueue {
  open(): Promise<IScanQueueSession>;
}
