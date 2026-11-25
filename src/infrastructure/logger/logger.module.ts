import { Module } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { AppConfig } from '../../config/index.js';

/**
 * Structured JSON logging (pino) with:
 *  - one log line per request, carrying the request id (`reqId`)
 *  - secrets redacted (auth headers, cookies, passwords, tokens)
 *  - pretty output in development only (`LOG_PRETTY=true`)
 *
 * Use it anywhere through Nest's standard Logger:
 *   private readonly logger = new Logger(MyService.name);
 *   this.logger.log({ orderId }, 'Order placed');   // object first, message second
 */
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          level: config.log.level,
          transport: config.log.pretty
            ? {
                target: 'pino-pretty',
                options: { singleLine: true, translateTime: 'SYS:HH:MM:ss.l' },
              }
            : undefined,
          // Request id is assigned by requestIdMiddleware (core/http) before pino runs.
          genReqId: (req: IncomingMessage) => (req as IncomingMessage & { id: string }).id,
          customProps: () => ({ service: 'zed-nest' }),
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'res.headers["set-cookie"]',
              '*.password',
              '*.refreshToken',
              '*.accessToken',
            ],
            censor: '[REDACTED]',
          },
          autoLogging: { ignore: (req: IncomingMessage) => req.url?.includes('/health') ?? false },
          serializers: {
            req: (req: { id: string; method: string; url: string }) => ({
              id: req.id,
              method: req.method,
              url: req.url,
            }),
          },
        },
      }),
    }),
  ],
})
export class LoggerModule {}
