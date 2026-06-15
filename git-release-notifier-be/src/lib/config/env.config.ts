import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),

  DATABASE_URL: z.string().url('Invalid DATABASE_URL'),
  REDIS_URL: z.string().url('Invalid REDIS_URL'),
  RABBITMQ_URL: z.string().url('Invalid RABBITMQ_URL'),
  GITHUB_TOKEN: z.string().min(1, 'GITHUB_TOKEN is required'),

  API_KEY: z.string().min(8, 'API_KEY should be at least 8 characters long'),
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
  server: {
    port: parsedEnv.PORT,
  },
  db: {
    url: parsedEnv.DATABASE_URL,
  },
  redis: {
    url: parsedEnv.REDIS_URL,
  },
  rabbit: {
    url: parsedEnv.RABBITMQ_URL,
  },
  github: {
    token: parsedEnv.GITHUB_TOKEN,
  },
  api: {
    key: parsedEnv.API_KEY,
  },
} as const;
