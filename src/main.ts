import type { Server } from 'node:http';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { AppConfig } from './config/index.js';
import { DOCS_PATH } from './core/openapi/openapi.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true, // hold early logs until pino is ready
    bodyParser: false, // configured in configureApp() with explicit limits
  });

  const logger = app.get(Logger);
  app.useLogger(logger);
  app.flushLogs();

  const config = app.get(AppConfig);
  configureApp(app, config);

  // SIGTERM/SIGINT → stop accepting requests, finish in-flight ones, close DB pool.
  app.enableShutdownHooks();

  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Unhandled promise rejection');
  });
  // After an uncaught exception the process state is unknown: log it and exit so the
  // orchestrator starts a clean instance instead of serving from a corrupted one.
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception, shutting down');
    process.exit(1);
  });

  // Keep idle connections open longer than the load balancer does (ALB/nginx default
  // to 60s). Otherwise the app closes a socket the proxy is about to reuse → 502s.
  const server = app.getHttpServer() as Server;
  server.keepAliveTimeout = config.http.keepAliveTimeoutMs;
  server.headersTimeout = config.http.keepAliveTimeoutMs + 1_000;

  await app.listen(config.http.port);

  const base = `http://localhost:${config.http.port}`;
  logger.log(`API ready at ${base}/${config.http.apiPrefix}/v1 (${config.env})`, 'Bootstrap');
  if (config.http.docsEnabled) logger.log(`API reference at ${base}/${DOCS_PATH}`, 'Bootstrap');
}

await bootstrap();
