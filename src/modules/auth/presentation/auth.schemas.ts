import { z } from 'zod';
import {
  displayNameSchema,
  emailSchema,
  passwordSchema,
  userResponseSchema,
} from '../../users/index.js';

export const registerSchema = z
  .object({ email: emailSchema, password: passwordSchema, displayName: displayNameSchema })
  .meta({ id: 'RegisterRequest' });
export type RegisterRequest = z.infer<typeof registerSchema>;

export const loginSchema = z
  .object({ email: emailSchema, password: z.string().min(1).max(128) })
  .meta({ id: 'LoginRequest' });
export type LoginRequest = z.infer<typeof loginSchema>;

export const refreshSchema = z
  .object({ refreshToken: z.string().min(1).max(4096) })
  .meta({ id: 'RefreshRequest' });
export type RefreshRequest = z.infer<typeof refreshSchema>;

export const tokenPairSchema = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string(),
    tokenType: z.literal('Bearer'),
    expiresIn: z.number().int().describe('Access token lifetime in seconds'),
  })
  .meta({ id: 'TokenPair' });

export const authResponseSchema = z
  .object({ user: userResponseSchema, tokens: tokenPairSchema })
  .meta({ id: 'AuthResponse' });
export type AuthResponse = z.infer<typeof authResponseSchema>;
