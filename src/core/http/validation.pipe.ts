import { StandardSchemaValidationPipe } from '@nestjs/common';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { ValidationError } from '../../shared/errors/index.js';

function formatPath(path: StandardSchemaV1.Issue['path']): string | undefined {
  if (!path?.length) return undefined;
  return path
    .map((segment) => (typeof segment === 'object' ? segment.key : segment))
    .map(String)
    .join('.');
}

/**
 * Global validation pipe.
 *
 * Validates any route parameter declared with a Standard Schema (Zod here):
 *   @Body({ schema: createUserSchema }) body: CreateUserInput
 *   @Query({ schema: paginationQuerySchema }) query: PageRequest
 *   @Param('id', { schema: z.uuid() }) id: string
 *
 * Parsed (coerced/defaulted) values replace the raw input. Failures become a
 * `ValidationError` → 400 problem+json with one entry per invalid field.
 */
export function createValidationPipe(): StandardSchemaValidationPipe {
  return new StandardSchemaValidationPipe({
    transform: true,
    exceptionFactory: (issues) =>
      new ValidationError(
        issues.map((issue) => ({ path: formatPath(issue.path), message: issue.message })),
      ),
  });
}
