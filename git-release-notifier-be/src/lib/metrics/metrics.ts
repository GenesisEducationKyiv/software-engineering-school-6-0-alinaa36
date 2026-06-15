import client from 'prom-client';
import { config } from '../config/env.config';

export interface IMetricsGauge {
  set(value: number): void;
}

export const register = new client.Registry();

register.setDefaultLabels({
  service: 'git-release-notifier',
  env: config.env,
});

client.collectDefaultMetrics({ register });

export const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'code'],
  buckets: [0.1, 0.5, 1, 2, 5],
});

export function registerActiveSubscriptionsGauge(provider: () => Promise<number>): client.Gauge {
  return new client.Gauge({
    name: 'active_subscriptions_total',
    help: 'Total number of active subscriptions in the database',
    registers: [register],
    async collect() {
      this.set(await provider());
    },
  });
}

export const workerJobDurationSeconds = new client.Histogram({
  name: 'worker_job_duration_seconds',
  help: 'Duration of worker batch processing in seconds',
  buckets: [0.1, 0.5, 1, 2, 5, 10],
});

export const workerJobsProcessedTotal = new client.Counter({
  name: 'worker_jobs_processed_total',
  help: 'Total number of worker jobs processed',
  labelNames: ['status'],
});

export const workerRetriesTotal = new client.Counter({
  name: 'worker_retries_total',
  help: 'Total number of worker job retries',
});

export const githubRequestDurationSeconds = new client.Histogram({
  name: 'github_request_duration_seconds',
  help: 'Duration of GitHub API requests in seconds',
  buckets: [0.1, 0.5, 1, 2, 5],
});

export const githubRequestsTotal = new client.Counter({
  name: 'github_requests_total',
  help: 'Total number of GitHub API requests',
  labelNames: ['status'],
});

register.registerMetric(githubRequestDurationSeconds);
register.registerMetric(githubRequestsTotal);
register.registerMetric(workerJobDurationSeconds);
register.registerMetric(workerJobsProcessedTotal);
register.registerMetric(workerRetriesTotal);
register.registerMetric(httpRequestDurationSeconds);
