import * as cron from 'node-cron';
import { addScanJobs } from '../../queue/queue.notifier';
import type { IJobQueue, IScheduledTask, IScheduler } from '../interfaces/notifier.interfaces';

export const cronScheduler: IScheduler = {
  schedule: (expression, handler): IScheduledTask => cron.schedule(expression, handler),
  stop: (task) => task.stop(),
};

export const scanJobQueue: IJobQueue = { addScanJobs };
