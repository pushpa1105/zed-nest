# Documentation

Pick a starting point based on what you need to do.

| I want to…                                       | Read                                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Run the project for the first time               | [01 – Getting started](01-getting-started.md)                                              |
| Understand how the code is organised and why     | [02 – Architecture](02-architecture.md), [03 – Project structure](03-project-structure.md) |
| Build a new feature or endpoint                  | [04 – Adding a feature](04-adding-a-feature.md)                                            |
| Write queries, migrations or transactions        | [05 – Database](05-database.md)                                                            |
| Switch from PostgreSQL, or from Kysely to an ORM | [05 – Database § Switching](05-database.md#switching-the-database-engine)                  |
| Add an environment variable                      | [06 – Configuration](06-configuration.md)                                                  |
| Validate input or document an endpoint           | [07 – Validation & API contracts](07-validation-and-api.md)                                |
| Return a proper error                            | [08 – Error handling](08-error-handling.md)                                                |
| Protect an endpoint, add roles or permissions    | [09 – Auth](09-authentication-and-authorization.md)                                        |
| Know what is secured, and harden for production  | [15 – Security](15-security.md)                                                            |
| Log, trace or monitor                            | [10 – Logging & observability](10-logging-and-observability.md)                            |
| Write tests                                      | [11 – Testing](11-testing.md)                                                              |
| Ship to production                               | [12 – Deployment](12-deployment.md)                                                        |
| Know the naming and code conventions             | [13 – Conventions](13-conventions.md)                                                      |
| Add Redis, queues, email, file uploads, …        | [14 – Recipes](14-recipes.md)                                                              |
| Know why a decision was made                     | [ADRs](adr/)                                                                               |

## The rules in brief

1. **Features own their code.** Everything about "orders" lives in `src/modules/orders/`.
2. **Dependencies point inward.** `presentation → application → domain ← infrastructure`. Domain code imports no framework and no database. The linter enforces this.
3. **Business code never touches the database directly.** Services depend on repository _ports_ (abstract classes). Only `infrastructure/` contains SQL.
4. **Throw `AppError`s, not `HttpException`s.** One filter turns them into HTTP responses.
5. **Every input is validated by a Zod schema.** The same schema gives you the type and the API reference.
6. **Read config from `AppConfig` only.** Never read `process.env` directly.
7. **Endpoints are private by default.** Use `@Public()` to opt out.
8. **Other features import from a feature's `index.ts` only.**
