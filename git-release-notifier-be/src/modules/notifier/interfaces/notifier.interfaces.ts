import * as cron from 'node-cron';

export interface IScheduler {
  schedule(expression: string, handler: () => void): cron.ScheduledTask;
  stop(task: cron.ScheduledTask): void;
}

export interface IJobQueue {
  addScanJobs(repos: string[]): Promise<void>;
}
