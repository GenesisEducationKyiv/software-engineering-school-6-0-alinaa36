export interface ScanJobPayload {
  repos: string[];
  lockKey: string;
  lockToken: string;
}

export interface IScanQueueSession {
  send(payload: ScanJobPayload): boolean;
  close(): Promise<void>;
}

export interface IScanQueue {
  open(): Promise<IScanQueueSession>;
}
