import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';

config({ path: '.env.test' });

export default defineConfig({
  test: {
    globals: true,
    fileParallelism: false,
    include: ['src/tests/integration/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    pool: 'forks',
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.DATABASE_URL,
      REDIS_URL: process.env.REDIS_URL,
      RABBITMQ_URL: process.env.RABBITMQ_URL,
      API_KEY: process.env.API_KEY,
      GITHUB_TOKEN: process.env.GITHUB_TOKEN,
      APP_URL: process.env.APP_URL,
    },
  },
});
