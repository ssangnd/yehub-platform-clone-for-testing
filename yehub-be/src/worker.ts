import { NestFactory } from '@nestjs/core';
import { Logger as NestLogger } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { AppService } from './app.service';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  const logger = new NestLogger('Worker');
  const appService = app.get(AppService);
  const port = Number(process.env.WORKER_PORT ?? 3001);

  const server = createServer(
    (req: IncomingMessage, res: ServerResponse): void => {
      if (req.method !== 'GET') {
        res.writeHead(405).end();
        return;
      }
      if (req.url === '/health/liveness') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }
      if (req.url === '/health/readiness') {
        appService
          .checkReadiness()
          .then((health) => {
            const code = health.status === 'ok' ? 200 : 503;
            res.writeHead(code, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(health));
          })
          .catch((err: Error) => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'error', error: err.message }));
          });
        return;
      }
      res.writeHead(404).end();
    },
  );

  server.listen(port, () => {
    logger.log(`Worker health server listening on port ${port}`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.log(`Received ${signal}, shutting down worker`);
    server.close();
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void bootstrap();
