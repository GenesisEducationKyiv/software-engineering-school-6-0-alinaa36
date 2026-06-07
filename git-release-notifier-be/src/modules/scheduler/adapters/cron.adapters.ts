import * as cron from 'node-cron';
import type { IScheduler } from '../interfaces/scheduler.interfaces';

export const cronScheduler: IScheduler = {
  schedule: (expression, handler) => cron.schedule(expression, handler),
};
