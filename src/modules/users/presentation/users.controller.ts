import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblem, ApiProblemResponses } from '../../../core/http/problem-details.js';
import { CurrentUser, Roles } from '../../../core/security/index.js';
import { mapPage, type Page } from '../../../shared/pagination/index.js';
import { UsersService } from '../application/users.service.js';
import { toUserResponse } from './user.presenter.js';
import {
  changePasswordSchema,
  changeRoleSchema,
  listUsersQuerySchema,
  updateProfileSchema,
  userIdParamSchema,
  userPageResponseSchema,
  userResponseSchema,
  type ChangePasswordRequest,
  type ChangeRoleRequest,
  type ListUsersQuery,
  type UpdateProfileRequest,
  type UserResponse,
} from './users.schemas.js';

/**
 * Thin HTTP adapter: validate (via schemas) → call the service → present.
 * No business logic lives here.
 */
@ApiTags('Users')
@ApiProblemResponses()
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the current user' })
  @ApiOkResponse({ standardSchema: userResponseSchema })
  async me(@CurrentUser('id') userId: string): Promise<UserResponse> {
    return toUserResponse(await this.users.getById(userId));
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update the current user profile' })
  @ApiOkResponse({ standardSchema: userResponseSchema })
  async updateMe(
    @CurrentUser('id') userId: string,
    @Body({ schema: updateProfileSchema }) body: UpdateProfileRequest,
  ): Promise<UserResponse> {
    return toUserResponse(await this.users.updateProfile(userId, body));
  }

  @Post('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Change the current user password',
    description: 'Signs the user out on every device: all sessions are revoked, log in again.',
  })
  @ApiNoContentResponse()
  @ApiProblem(422, '`INVALID_CURRENT_PASSWORD`')
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body({ schema: changePasswordSchema }) body: ChangePasswordRequest,
  ): Promise<void> {
    await this.users.changePassword(userId, body);
  }

  @Get()
  @Roles('admin')
  @ApiOperation({ summary: 'List users (admin)' })
  @ApiOkResponse({ standardSchema: userPageResponseSchema })
  async list(
    @Query({ schema: listUsersQuerySchema }) query: ListUsersQuery,
  ): Promise<Page<UserResponse>> {
    return mapPage(await this.users.list(query), toUserResponse);
  }

  @Get(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Get a user by id (admin)' })
  @ApiOkResponse({ standardSchema: userResponseSchema })
  @ApiProblem(404, '`USER_NOT_FOUND`')
  async get(@Param('id', { schema: userIdParamSchema }) id: string): Promise<UserResponse> {
    return toUserResponse(await this.users.getById(id));
  }

  @Patch(':id/role')
  @Roles('admin')
  @ApiOperation({ summary: "Change a user's role (admin)" })
  @ApiOkResponse({ standardSchema: userResponseSchema })
  @ApiProblem(
    403,
    '`FORBIDDEN`: requires role admin. `CANNOT_MODIFY_SELF`: not on your own account',
  )
  @ApiProblem(404, '`USER_NOT_FOUND`')
  async changeRole(
    @CurrentUser('id') actorId: string,
    @Param('id', { schema: userIdParamSchema }) id: string,
    @Body({ schema: changeRoleSchema }) body: ChangeRoleRequest,
  ): Promise<UserResponse> {
    return toUserResponse(await this.users.changeRole(actorId, id, body.role));
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a user (admin)' })
  @ApiNoContentResponse()
  @ApiProblem(
    403,
    '`FORBIDDEN`: requires role admin. `CANNOT_MODIFY_SELF`: not on your own account',
  )
  @ApiProblem(404, '`USER_NOT_FOUND`')
  async remove(
    @CurrentUser('id') actorId: string,
    @Param('id', { schema: userIdParamSchema }) id: string,
  ): Promise<void> {
    await this.users.delete(actorId, id);
  }
}
