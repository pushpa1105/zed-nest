import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { z } from 'zod';

/**
 * Error response body — RFC 9457 "Problem Details for HTTP APIs"
 * (https://www.rfc-editor.org/rfc/rfc9457), served as `application/problem+json`.
 *
 * Clients should branch on `code` (stable) — never on `detail` (human text).
 */
export const problemDetailsSchema = z
  .object({
    type: z.string().describe('URI reference identifying the problem type'),
    title: z.string().describe('Short summary of the HTTP status'),
    status: z.number().int(),
    detail: z.string().describe('Human-readable explanation'),
    instance: z.string().describe('Request path'),
    code: z.string().describe('Stable machine-readable error code, e.g. USER_NOT_FOUND'),
    requestId: z.string().describe('Correlation id — quote it when reporting issues'),
    errors: z
      .array(z.object({ path: z.string().optional(), message: z.string() }).loose())
      .optional()
      .describe('Field-level details (validation errors, constraints, ...)'),
  })
  .meta({ id: 'ProblemDetails' });

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

/**
 * Documents one error response of an endpoint. Name the stable codes in the description:
 *
 *   @ApiProblem(404, '`USER_NOT_FOUND`')
 *   @ApiProblem(409, '`USER_EMAIL_TAKEN`: the email is already registered')
 */
export const ApiProblem = (status: number, description: string): MethodDecorator & ClassDecorator =>
  ApiResponse({ status, description, standardSchema: problemDetailsSchema });

/** Documents the error responses every endpoint can return. Put it on the controller. */
export const ApiProblemResponses = (): MethodDecorator & ClassDecorator =>
  applyDecorators(
    ApiProblem(400, '`VALIDATION_FAILED`: see `errors` for the offending fields'),
    ApiProblem(401, '`INVALID_ACCESS_TOKEN`: missing, invalid or expired access token'),
    ApiProblem(429, '`TOO_MANY_REQUESTS`: rate limit exceeded, retry after `Retry-After` seconds'),
    ApiProblem(500, '`INTERNAL_ERROR`: unexpected error, quote `requestId` when reporting it'),
  );
