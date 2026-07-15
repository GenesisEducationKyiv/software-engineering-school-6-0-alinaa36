import http from 'http';
import { Logger } from '../logger/logger';
import { config } from '../config/env.config';
import { register } from './metrics';

export function startMetricsServer(): http.Server {
  const server = http.createServer((req, res) => {
    if (req.url === '/metrics' && req.method === 'GET') {
      register
        .metrics()
        .then((body) => {
          res.writeHead(200, { 'Content-Type': register.contentType });
          res.end(body);
        })
        .catch((err: unknown) => {
          Logger.error({ err }, '[Metrics] Failed to collect metrics');
          res.writeHead(500);
          res.end();
        });

      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.listen(config.metrics.port, () => {
    Logger.info({ port: config.metrics.port }, '[Metrics] /metrics endpoint ready');
  });

  return server;
}
