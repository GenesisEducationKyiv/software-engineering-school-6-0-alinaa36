import pino from 'pino';
import { config } from '../config/env.config';

const isDev = config.env !== 'production';

export const Logger = pino({
  level: isDev ? 'debug' : 'info',
  redact: {
    paths: [
      'email',
      '*.email',
      'token',
      '*.token',
      '*.password',
      '*.pass',
      'req.headers.authorization',
      'req.headers["x-api-key"]',
    ],
    censor: '[REDACTED]',
  },
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
});
