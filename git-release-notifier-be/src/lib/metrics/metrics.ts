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
  registers: [register],
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
  registers: [register],
});

export const workerJobsProcessedTotal = new client.Counter({
  name: 'worker_jobs_processed_total',
  help: 'Total number of worker jobs processed',
  labelNames: ['status'],
  registers: [register],
});

export const workerRetriesTotal = new client.Counter({
  name: 'worker_retries_total',
  help: 'Total number of worker job retries',
  registers: [register],
});

export const githubRequestDurationSeconds = new client.Histogram({
  name: 'github_request_duration_seconds',
  help: 'Duration of GitHub API requests in seconds',
  buckets: [0.1, 0.5, 1, 2, 5],
  registers: [register],
});

export const githubRequestsTotal = new client.Counter({
  name: 'github_requests_total',
  help: 'Total number of GitHub API requests',
  labelNames: ['status'],
  registers: [register],
});

export const notifierDurationSeconds = new client.Histogram({
  name: 'notifier_email_duration_seconds',
  help: 'Duration of email sending in seconds',
  buckets: [0.1, 0.5, 1, 2, 5],
  registers: [register],
});

export const notifierEmailsTotal = new client.Counter({
  name: 'notifier_emails_total',
  help: 'Total number of emails sent',
  labelNames: ['type', 'status'],
  registers: [register],
});