export interface IScheduledTask {
  stop(): void;
  start(): void;
}

export interface IScheduler {
  schedule(expression: string, handler: () => void): IScheduledTask;
  stop(task: IScheduledTask): void;
}

export interface IJobQueue {
  addScanJobs(repos: string[]): Promise<void>;
}

export interface ISubscriptionServiceForScanner {
  groupByRepository(): Promise<{ repository: string }[]>;
}
