import { z } from 'zod';
import { pageResponseSchema, paginationQuerySchema } from '../../../shared/pagination/index.js';
import { ROLES } from '../../../shared/security/role.js';

/**
 * HTTP contracts for the users feature.
 *
 * One Zod schema = runtime validation + TypeScript type + OpenAPI docs.
 * `.meta({ id })` names the schema in the OpenAPI components section.
 */

export const passwordSchema = z
  .string()
  .min(8, 'must be at least 8 characters')
  .max(128, 'must be at most 128 characters')
  .regex(/[a-z]/, 'must contain a lowercase letter')
  .regex(/[A-Z]/, 'must contain an uppercase letter')
  .regex(/\d/, 'must contain a digit');

export const emailSchema = z.email().max(320);
export const displayNameSchema = z.string().trim().min(1).max(100);

// ---- Requests ---------------------------------------------------------------

export const userIdParamSchema = z.uuid();

export const listUsersQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).max(100).optional(),
  role: z.enum(ROLES).optional(),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

export const updateProfileSchema = z
  .object({ displayName: displayNameSchema })
  .meta({ id: 'UpdateProfileRequest' });
export type UpdateProfileRequest = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema })
  .refine((v) => v.currentPassword !== v.newPassword, {
    path: ['newPassword'],
    message: 'must differ from the current password',
  })
  .meta({ id: 'ChangePasswordRequest' });
export type ChangePasswordRequest = z.infer<typeof changePasswordSchema>;

export const changeRoleSchema = z.object({ role: z.enum(ROLES) }).meta({ id: 'ChangeRoleRequest' });
export type ChangeRoleRequest = z.infer<typeof changeRoleSchema>;

// ---- Responses --------------------------------------------------------------

export const userResponseSchema = z
  .object({
    id: z.uuid(),
    email: z.email(),
    displayName: z.string(),
    role: z.enum(ROLES),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'User' });
export type UserResponse = z.infer<typeof userResponseSchema>;

export const userPageResponseSchema = pageResponseSchema(userResponseSchema).meta({
  id: 'UserPage',
});
