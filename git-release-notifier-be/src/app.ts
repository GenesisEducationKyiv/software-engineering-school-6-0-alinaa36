import 'dotenv/config';
import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import type { OpenAPIV2 } from 'openapi-types';
import { readFileSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';
import { register } from './lib/metrics/metrics';
import { Logger } from './lib/logger/logger';
import { errorHandler } from './lib/errors/error.handler';
import { diPlugin } from './modules/common/plugins/di.plugin';
import NotifierModule from './modules/notifier/notifier.module';
import { subscriptionRoutes } from './modules/subscriptions/routes/subscription.route';
import { fastifyCors } from '@fastify/cors';
import { startGrpcServer } from './grpc/grpc-server';

export async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false });

  fastify.setErrorHandler(errorHandler);

  await fastify.register(fastifyCors, {
    origin: true,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  });

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
  await fastify.register(subscriptionRoutes, { prefix: '/api' });
  await fastify.register(NotifierModule);

  return fastify;
}

if (require.main === module) {
  void import('./workers/scanner/scanner.worker');

  buildApp()
    .then(async (fastify) => {
      try {
        await fastify.listen({ port: 3000, host: '0.0.0.0' });
        Logger.info('[REST API] Server is running on http://localhost:3000');
        Logger.info('[REST API] Swagger UI available at http://localhost:3000/docs');
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
    Logger.info(`Received ${signal}. Shutting down gracefully...`);
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
