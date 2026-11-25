import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiExtension } from '@nestjs/swagger';

export const IS_PUBLIC_KEY = 'auth:isPublic';

/** Marks public operations in the generated document; removed again in core/openapi. */
export const PUBLIC_ROUTE_EXTENSION = 'x-public';

/**
 * Every route requires a valid access token by default (secure-by-default).
 * Mark a controller or handler with `@Public()` to opt out. The API reference
 * then shows the operation without the bearer requirement.
 */
export const Public = (): MethodDecorator & ClassDecorator =>
  applyDecorators(SetMetadata(IS_PUBLIC_KEY, true), ApiExtension(PUBLIC_ROUTE_EXTENSION, true));
