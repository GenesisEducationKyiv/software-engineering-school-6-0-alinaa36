export interface IScheduler {
  schedule(expression: string, handler: () => void): IScheduledTask;
}

export interface IScheduledTask {
  stop(): void;
}

export interface IJobQueue {
  addScanJobs(repos: string[]): Promise<void>;
}

export interface IRepositorySource {
  groupByRepository(): Promise<{ repository: string }[]>;
}
