import pino from 'pino';
import { config } from '../config/env.config';

const isDev = config.env !== 'production';

export const Logger = pino({
  level: 'info',

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
