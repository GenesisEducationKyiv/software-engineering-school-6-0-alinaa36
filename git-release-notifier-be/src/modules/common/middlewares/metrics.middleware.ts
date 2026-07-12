import { FastifyInstance } from 'fastify';
import { httpRequestDurationMicroseconds } from '../../../lib/metrics/metrics';

export function metricsMiddleware(fastify: FastifyInstance) {
  fastify.addHook('onResponse', async (request, reply) => {
    if (request.routeOptions.config.url) {
      httpRequestDurationMicroseconds
        .labels(request.method, request.routeOptions.config.url, reply.statusCode.toString())
        .observe(reply.elapsedTime / 1000);
    }
  });
}
