import client from 'prom-client';
import { config } from '../config/env.config';

export const register = new client.Registry();

register.setDefaultLabels({
  service: 'notification-service',
  env: config.env,
});

client.collectDefaultMetrics({ register });

export const notifierDurationSeconds = new client.Histogram({
  name: 'notifier_email_duration_seconds',
  help: 'Duration of email sending in seconds',
  buckets: [0.1, 0.5, 1, 2, 5],
});

export const notifierEmailsTotal = new client.Counter({
  name: 'notifier_emails_total',
  help: 'Total number of emails sent',
  labelNames: ['type', 'status'],
});

register.registerMetric(notifierDurationSeconds);
register.registerMetric(notifierEmailsTotal);
