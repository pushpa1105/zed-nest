import {
  Injectable,
  RequestTimeoutException,
  SetMetadata,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { catchError, throwError, timeout, TimeoutError, type Observable } from 'rxjs';
import { AppConfig } from '../../config/index.js';

export const TIMEOUT_KEY = 'http:timeoutMs';

/** Override the global request timeout for a slow endpoint: `@Timeout(60_000)`. */
export const Timeout = (ms: number): MethodDecorator & ClassDecorator =>
  SetMetadata(TIMEOUT_KEY, ms);

/** Fails requests that exceed `REQUEST_TIMEOUT_MS` with 408 instead of hanging forever. */
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  constructor(
    private readonly config: AppConfig,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ms =
      this.reflector.getAllAndOverride<number | undefined>(TIMEOUT_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? this.config.http.requestTimeoutMs;

    return next.handle().pipe(
      timeout(ms),
      catchError((err: unknown) =>
        throwError(() => (err instanceof TimeoutError ? new RequestTimeoutException() : err)),
      ),
    );
  }
}
