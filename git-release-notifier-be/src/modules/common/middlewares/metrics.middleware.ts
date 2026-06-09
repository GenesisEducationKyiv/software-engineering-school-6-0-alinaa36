import type { FastifyInstance } from 'fastify';
import { httpRequestDurationSeconds } from '../../../lib/metrics/metrics';

export function metricsMiddleware(fastify: FastifyInstance): void {
  fastify.addHook('onResponse', async (request, reply) => {
    const route = request.routeOptions.config.url ?? 'unmatched';

    httpRequestDurationSeconds
      .labels(request.method, route, reply.statusCode.toString())
      .observe(reply.elapsedTime / 1000);
  });
}
