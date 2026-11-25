/**
 * Writes the OpenAPI document to disk without starting the HTTP server.
 *
 *   pnpm openapi:export                 → ./openapi.json
 *   pnpm openapi:export path/to/file    → custom location
 *
 * Runs from the compiled build (the script builds first).
 * Use it to generate typed clients, publish the contract, or diff it in CI to catch
 * accidental breaking changes. It needs a valid environment (.env) but never
 * connects to the database.
 */
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../../../app.module.js';
import { configureApp } from '../../../app.setup.js';
import { AppConfig } from '../../../config/index.js';
import { createOpenApiDocument } from '../openapi.js';

const target = resolve(process.argv[2] ?? 'openapi.json');

const app = await NestFactory.create<NestExpressApplication>(AppModule, {
  logger: ['error'],
  bodyParser: false,
});
configureApp(app, app.get(AppConfig)); // applies the global prefix and versioning to the paths

const document = createOpenApiDocument(app);
await writeFile(target, `${JSON.stringify(document, null, 2)}\n`);
await app.close();

console.log(`Wrote ${Object.keys(document.paths).length} paths to ${target}`);
