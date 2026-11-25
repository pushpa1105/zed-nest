# 09 · Authentication & authorization

## Overview

| Piece                            | Where                                        | What                                                          |
| -------------------------------- | -------------------------------------------- | ------------------------------------------------------------- |
| `AuthGuard` (global)             | `modules/auth/presentation/auth.guard.ts`    | Verifies the bearer token, sets `req.user`, enforces `@Roles` |
| `@Public()`                      | `core/security`                              | Opts a route or controller out of authentication              |
| `@Roles('admin')`                | `core/security`                              | Requires one of the listed roles                              |
| `@CurrentUser()`                 | `core/security`                              | Injects `AuthenticatedUser` (`{ id, role, sessionId }`)       |
| `TokenService`                   | `modules/auth/application`                   | Signs and verifies JWTs                                       |
| `AuthService`                    | `modules/auth/application`                   | Register, login, refresh, logout                              |
| `PasswordHasher` port → Argon2id | `shared/security`, `infrastructure/security` | Password hashing                                              |

**Secure by default.** Every route needs a valid access token unless it is marked `@Public()`. If you forget a decorator, you get a locked endpoint, not a data leak.

## Endpoints

| Method | Path                      | Auth   | Description                                          |
| ------ | ------------------------- | ------ | ---------------------------------------------------- |
| POST   | `/api/v1/auth/register`   | public | Create an account and a session → `{ user, tokens }` |
| POST   | `/api/v1/auth/login`      | public | Credentials → `{ user, tokens }`                     |
| POST   | `/api/v1/auth/refresh`    | public | `{ refreshToken }` → new token pair (rotation)       |
| POST   | `/api/v1/auth/logout`     | bearer | Revoke the current session                           |
| POST   | `/api/v1/auth/logout-all` | bearer | Revoke all sessions (every device)                   |

Credential endpoints have a stricter rate limit (10/min per IP).

Sessions end in four ways:

| Event                                 | Effect                               |
| ------------------------------------- | ------------------------------------ |
| `POST /auth/logout`                   | The current session is revoked       |
| `POST /auth/logout-all`               | Every session of the user is revoked |
| `POST /users/me/password` (success)   | Every session of the user is revoked |
| An already-used refresh token is sent | Every session of the user is revoked |

## Token model

```
login ──▶ session row (id, user_id, sha256(refresh token), expires_at, revoked_at, ua, ip)
       ──▶ access token  (JWT, 15 min, {sub, role, sid, typ:"access"})
       ──▶ refresh token (JWT, 14 days, {sub, sid, jti, typ:"refresh"})
```

- **Access tokens** are stateless: verifying one checks the signature only, with no DB hit, so it is fast. A revoked session stays usable until its access token expires (at most 15 minutes). If you need instant revocation, check `sid` against the DB or a cache in the guard. That adds latency to every request.
- **Refresh tokens** are rotated on every use. The DB stores **only a SHA-256 hash**, so a database leak doesn't expose usable tokens.
- **Reuse detection:** presenting an already-rotated refresh token means it was stolen or replayed. **Every session of that user is revoked.** The check is a compare-and-swap `UPDATE`, so two concurrent refreshes with the same token can't both succeed.
- Access and refresh tokens use **different secrets** and a `typ` claim, so one can't be used as the other. The algorithm is pinned to HS256, and issuer and audience are checked.
- Login doesn't reveal whether an email exists. Responses are the same and a dummy hash comparison equalises timing.
- **Changing the password signs the user out everywhere.** `UsersService.changePassword` publishes `UserPasswordChangedEvent` inside its transaction and awaits it; the auth feature's `SessionRevocationListener` revokes the sessions. If revocation fails, the password change rolls back. The client must log in again with the new password.

### Client flow

```
1. login            → store accessToken in memory, refreshToken in secure storage
2. API calls        → Authorization: Bearer <accessToken>
3. 401 INVALID_ACCESS_TOKEN → POST /auth/refresh → retry once
4. refresh fails (401 INVALID_REFRESH_TOKEN) → send the user to login
```

**Browser SPA?** Consider putting the refresh token in an `HttpOnly; Secure; SameSite=Strict` cookie instead of the body (see [Recipes](14-recipes.md#refresh-token-in-an-httponly-cookie)).

## Protecting endpoints

```ts
@Controller({ path: 'reports', version: '1' })
export class ReportsController {
  @Get('public-summary')
  @Public() // anyone
  summary() {}

  @Get('mine') // any authenticated user
  mine(@CurrentUser('id') userId: string) {}

  @Delete(':id')
  @Roles('admin') // admins only
  remove() {}
}
```

`@Roles` and `@Public` can go on the controller class (applies to every handler) or on individual methods (the method wins).

### Ownership checks (resource-level authorization)

Roles answer "what kind of user is this?". Ownership questions like "can _this_ user edit _this_ order?" belong in the **service**, because they are business rules:

```ts
async cancel(actor: AuthenticatedUser, orderId: string) {
  const order = await this.getById(orderId);
  if (order.customerId !== actor.id && actor.role !== 'admin') {
    throw new ForbiddenError('You cannot cancel this order', 'ORDER_NOT_OWNED');
  }
  …
}
```

## Extending

### Add a role

1. Add it to `ROLES` in `src/shared/security/role.ts`.
2. Write a migration that updates the `users_role_check` constraint.
3. Use `@Roles('support')`.

### Permissions (fine-grained RBAC)

When roles get too coarse:

1. Define `PERMISSIONS = ['orders:read', 'orders:refund', …]` and a `ROLE_PERMISSIONS: Record<Role, Permission[]>` map in `shared/security`.
2. Add a `@RequirePermissions(...)` decorator in `core/security`.
3. In `AuthGuard`, resolve the user's permissions from the role (or from a DB table) and check them.

If rules depend on resource attributes, consider CASL for attribute-based access control (ABAC).

### Asymmetric keys (multiple services verifying tokens)

Switch `TokenService` to RS256 or EdDSA. Sign with a private key and publish the public key (JWKS) so other services can verify tokens without the secret.

### Other login methods

OAuth/OIDC (Google, Microsoft, Auth0, Keycloak), magic links and passkeys all end the same way: once the identity is verified, open a session through `AuthService`'s private `startSession()` helper. That means one more public method in `AuthService` (such as `loginWithOidc`) and one more controller route. The guard and the rest of the app don't change.

### Session housekeeping

`SessionCleanupService` deletes expired sessions once an hour, so `auth_sessions` stays small. It uses a plain unref'd timer and is safe to run on every replica, because the delete is idempotent. It does not run in tests (`NODE_ENV=test`); call `run()` directly there.

For jobs that must run on exactly one instance, see [Recipes](14-recipes.md#scheduled-jobs).

## Security notes

The threat model, what is deliberately left out (MFA, email verification, account lockout, instant access-token revocation) and the pre-launch checklist are in [15 – Security](15-security.md).
