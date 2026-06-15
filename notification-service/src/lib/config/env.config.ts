import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  RABBITMQ_URL: z.string().url('Invalid RABBITMQ_URL'),
  REDIS_URL: z.string().url('Invalid REDIS_URL'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  METRICS_PORT: z.coerce.number().default(9101),

  RECONNECT_DELAY_MS: z.coerce.number().default(5_000),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().default(10_000),
  IDEMPOTENCY_TTL_SECONDS: z.coerce.number().default(86_400),

  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number(),
  SMTP_USER: z.string().email(),
  SMTP_PASS: z.string().min(1),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  _env.error.issues.forEach((issue) => {
    console.error(`[${String(issue.path[0])}]: ${issue.message}`);
  });
  process.exit(1);
}

const parsedEnv = _env.data;

export const config = {
  env: parsedEnv.NODE_ENV,
  rabbit: {
    url: parsedEnv.RABBITMQ_URL,
  },
  redis: {
    url: parsedEnv.REDIS_URL,
  },
  app: {
    url: parsedEnv.APP_URL,
  },
  metrics: {
    port: parsedEnv.METRICS_PORT,
  },
  consumer: {
    reconnectDelayMs: parsedEnv.RECONNECT_DELAY_MS,
    shutdownTimeoutMs: parsedEnv.SHUTDOWN_TIMEOUT_MS,
  },
  idempotency: {
    ttlSeconds: parsedEnv.IDEMPOTENCY_TTL_SECONDS,
  },
  mail: {
    host: parsedEnv.SMTP_HOST,
    port: parsedEnv.SMTP_PORT,
    auth: {
      user: parsedEnv.SMTP_USER,
      pass: parsedEnv.SMTP_PASS,
    },
  },
} as const;
