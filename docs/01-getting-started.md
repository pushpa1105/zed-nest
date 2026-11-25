# 01 · Getting started

## Prerequisites

| Tool    | Version            | Notes                                             |
| ------- | ------------------ | ------------------------------------------------- |
| Node.js | 24 (see `.nvmrc`)  | 22.12+ works. Nest 12 needs native `require(esm)` |
| pnpm    | 10                 | `corepack enable` gives you the pinned version    |
| Docker  | any recent version | For PostgreSQL and for e2e tests (Testcontainers) |

## First run

```bash
pnpm install
cp .env.example .env          # defaults work for local dev
docker compose up -d          # starts PostgreSQL 18 on :5432
pnpm db:migrate               # creates tables
pnpm db:seed                  # creates admin@example.com / ChangeMe123!
pnpm start:dev
```

Open the API reference at <http://localhost:3000/docs>, then:

1. Open **Auth → Exchange credentials for tokens**, press **Test Request** and send the admin credentials.
2. Copy the `accessToken` from the response into the **Authentication** box at the top of the page.
3. Call **Users → List users**.

> **Port 3000 in use?** Set `PORT=3001` in `.env`.

## Try it with curl

```bash
# register
curl -s -X POST localhost:3000/api/v1/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"jane@example.com","password":"Secret123","displayName":"Jane"}'

# use the returned accessToken
curl -s localhost:3000/api/v1/users/me -H "authorization: Bearer <accessToken>"
```

## Everyday commands

```bash
pnpm start:dev          # watch mode
pnpm test:watch         # unit tests in watch mode
pnpm validate           # run before pushing: lint + typecheck + tests + build
pnpm test:e2e           # full HTTP tests against a throwaway Postgres
pnpm db:migrate:create add_orders_table
pnpm gen:feature order  # scaffold a full feature
```

## Run everything in Docker

```bash
docker compose --profile full up --build
```

This builds the production image, runs migrations in a one-off `migrate` container, and then starts the API.

## Editor setup (VS Code)

Install the recommended extensions when prompted (`.vscode/extensions.json`): oxc (lint), Prettier, Vitest, EditorConfig. The workspace settings turn on format-on-save and `.js` import suffixes.

## Troubleshooting

| Symptom                                        | Fix                                                                                      |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `Invalid environment configuration: …` on boot | The message lists each bad variable. Compare your `.env` with `.env.example`.            |
| `ECONNREFUSED 127.0.0.1:5432`                  | `docker compose up -d`, and check `docker compose ps`                                    |
| `Cannot find module './x'`                     | ESM needs the `.js` suffix on relative imports: `./x.js`                                 |
| e2e tests hang on start                        | Docker must be running. Or point `TEST_DATABASE_URL` at an empty database.               |
| `corrupted migrations`                         | A migration you already applied was renamed or deleted. Never rename applied migrations. |
