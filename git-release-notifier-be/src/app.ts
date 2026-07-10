import 'dotenv/config';
import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import type { OpenAPIV2 } from 'openapi-types';
import { readFileSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';
import type { Logger as PinoLogger } from 'pino';
import type { Server, IncomingMessage, ServerResponse } from 'http';
import { register } from './lib/metrics/metrics';
import { Logger } from './lib/logger/logger';
import { errorHandler } from './lib/errors/error.handler';
import { metricsMiddleware } from './modules/common/middlewares/metrics.middleware';
import SchedulerModule from './modules/scheduler/scheduler.module';
import { subscriptionRoutes } from './modules/subscriptions/routes/subscription.route';
import { htmlRoutes } from './modules/subscriptions/routes/html.routes';
import { fastifyCors } from '@fastify/cors';
import { startGrpcServer } from './grpc/grpc-server';
import { closeRabbitConnection } from './lib/rabbit/rabbit.connection';
import { config } from './lib/config/env.config';
import { diPlugin } from './composition/di.plugin';

export type App = FastifyInstance<Server, IncomingMessage, ServerResponse, PinoLogger>;

export async function buildApp(): Promise<App> {
  const fastify = Fastify<Server, IncomingMessage, ServerResponse, PinoLogger>({
    loggerInstance: Logger,
  });

  fastify.setErrorHandler(errorHandler);

  await fastify.register(fastifyCors, {
    origin: true,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  });

  await fastify.register(metricsMiddleware);

  fastify.get('/metrics', async (_req, reply) => {
    reply.header('Content-Type', register.contentType);

    return register.metrics();
  });

  const swaggerDocument = yaml.load(
    readFileSync(join(__dirname, 'docs/swagger.yaml'), 'utf8'),
  ) as OpenAPIV2.Document;

  await fastify.register(fastifySwagger, {
    mode: 'static',
    specification: {
      document: swaggerDocument,
    },
  });

  await fastify.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });

  await fastify.register(diPlugin);
  await fastify.register(htmlRoutes);
  await fastify.register(subscriptionRoutes, { prefix: '/api' });
  await fastify.register(SchedulerModule);

  return fastify;
}

if (require.main === module) {
  buildApp()
    .then(async (fastify) => {
      try {
        await fastify.listen({ port: config.server.port, host: '0.0.0.0' });

        Logger.info({ port: config.server.port }, '[REST API] Server is running');
        Logger.info({ port: config.server.port, path: '/docs' }, '[REST API] Swagger UI available');

        startGrpcServer(fastify.subscriptionService);
      } catch (err) {
        Logger.error({ err }, '[App] Server failed to start');
        process.exit(1);
      }
    })
    .catch((err) => {
      Logger.error({ err }, '[App] Failed to build app');
      process.exit(1);
    });

  const shutdown = (signal: string): void => {
    Logger.info({ signal }, 'Shutting down gracefully');
    void closeRabbitConnection().finally(() => process.exit(0));
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
