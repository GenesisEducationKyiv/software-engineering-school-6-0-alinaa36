import client from 'prom-client';

export interface IMetricsGauge {
  set(value: number): void;
}

export const register = new client.Registry();

client.collectDefaultMetrics({ register });

export const httpRequestDurationMicroseconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'code'],
  buckets: [0.1, 0.5, 1, 2, 5],
});

export const activeSubscriptionsGauge = new client.Gauge({
  name: 'active_subscriptions_total',
  help: 'Total number of active subscriptions in the database',
});

register.registerMetric(httpRequestDurationMicroseconds);
register.registerMetric(activeSubscriptionsGauge);
