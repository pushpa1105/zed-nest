/**
 * Feature scaffolder.
 *
 *   pnpm gen:feature <name> [--plural <plural>] [--dry-run]
 *
 *   pnpm gen:feature product                 → modules/products, table `products`
 *   pnpm gen:feature category --plural categories
 *   pnpm gen:feature order-item              → modules/order-items, table `order_items`
 *
 * Generates a complete, working CRUD vertical slice following the same
 * architecture as `modules/users` (domain → application → infrastructure →
 * presentation), a migration, and registers the module + table type.
 * Then: run `pnpm db:migrate`, adjust fields, write business rules.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const SRC = join(ROOT, 'src');

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------
interface Names {
  kebab: string; // order-item
  kebabPlural: string; // order-items
  Pascal: string; // OrderItem
  PascalPlural: string; // OrderItems
  camel: string; // orderItem
  camelPlural: string; // orderItems
  table: string; // order_items  (SQL)
  CONST: string; // ORDER_ITEM
  label: string; // order item
}

function pluralize(word: string): string {
  if (/[^aeiou]y$/.test(word)) return word.slice(0, -1) + 'ies';
  if (/(s|x|z|ch|sh)$/.test(word)) return word + 'es';
  return word + 's';
}

function buildNames(kebab: string, kebabPlural: string): Names {
  const pascal = (s: string) =>
    s
      .split('-')
      .map((p) => p[0]!.toUpperCase() + p.slice(1))
      .join('');
  const camel = (s: string) => pascal(s)[0]!.toLowerCase() + pascal(s).slice(1);
  return {
    kebab,
    kebabPlural,
    Pascal: pascal(kebab),
    PascalPlural: pascal(kebabPlural),
    camel: camel(kebab),
    camelPlural: camel(kebabPlural),
    table: kebabPlural.replaceAll('-', '_'),
    CONST: kebab.replaceAll('-', '_').toUpperCase(),
    label: kebab.replaceAll('-', ' '),
  };
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------
function templates(n: Names): Record<string, string> {
  const base = `modules/${n.kebabPlural}`;
  return {
    [`${base}/domain/${n.kebab}.ts`]: `import { generateId } from '../../../shared/utils/id.js';

export interface ${n.Pascal}Props {
  readonly id: string;
  name: string;
  description: string | null;
  readonly createdAt: Date;
  updatedAt: Date;
}

export interface Create${n.Pascal}Props {
  name: string;
  description?: string | null;
}

/** ${n.Pascal} entity. Pure TypeScript — put invariants & behaviour here. */
export class ${n.Pascal} {
  private constructor(private readonly props: ${n.Pascal}Props) {}

  static create(input: Create${n.Pascal}Props, now: Date = new Date()): ${n.Pascal} {
    return new ${n.Pascal}({
      id: generateId(),
      name: input.name.trim(),
      description: input.description ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(props: ${n.Pascal}Props): ${n.Pascal} {
    return new ${n.Pascal}({ ...props });
  }

  get id(): string {
    return this.props.id;
  }
  get name(): string {
    return this.props.name;
  }
  get description(): string | null {
    return this.props.description;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  update(changes: { name?: string; description?: string | null }, now: Date = new Date()): void {
    if (changes.name !== undefined) this.props.name = changes.name.trim();
    if (changes.description !== undefined) this.props.description = changes.description;
    this.props.updatedAt = now;
  }

  toSnapshot(): Readonly<${n.Pascal}Props> {
    return { ...this.props };
  }
}
`,

    [`${base}/domain/${n.kebab}.repository.ts`]: `import type { Page, PageRequest } from '../../../shared/pagination/index.js';
import type { ${n.Pascal} } from './${n.kebab}.js';

export interface ${n.Pascal}ListQuery extends PageRequest {
  search?: string;
}

/** Persistence port. Implemented by infrastructure/kysely-${n.kebab}.repository.ts */
export abstract class ${n.Pascal}Repository {
  abstract findById(id: string): Promise<${n.Pascal} | null>;
  abstract list(query: ${n.Pascal}ListQuery): Promise<Page<${n.Pascal}>>;
  abstract insert(entity: ${n.Pascal}): Promise<void>;
  abstract update(entity: ${n.Pascal}): Promise<void>;
  abstract delete(id: string): Promise<boolean>;
}
`,

    [`${base}/domain/${n.kebab}.errors.ts`]: `import { NotFoundError } from '../../../shared/errors/index.js';

export class ${n.Pascal}NotFoundError extends NotFoundError {
  constructor(id: string) {
    super('${n.Pascal} ' + id + ' not found', '${n.CONST}_NOT_FOUND');
  }
}
`,

    [`${base}/application/${n.kebabPlural}.service.ts`]: `import { Injectable } from '@nestjs/common';
import type { Page } from '../../../shared/pagination/index.js';
import { ${n.Pascal} } from '../domain/${n.kebab}.js';
import { ${n.Pascal}NotFoundError } from '../domain/${n.kebab}.errors.js';
import { ${n.Pascal}Repository, type ${n.Pascal}ListQuery } from '../domain/${n.kebab}.repository.js';

export interface Create${n.Pascal}Input {
  name: string;
  description?: string | null;
}

export type Update${n.Pascal}Input = Partial<Create${n.Pascal}Input>;

@Injectable()
export class ${n.PascalPlural}Service {
  constructor(private readonly ${n.camelPlural}: ${n.Pascal}Repository) {}

  async create(input: Create${n.Pascal}Input): Promise<${n.Pascal}> {
    const entity = ${n.Pascal}.create(input);
    await this.${n.camelPlural}.insert(entity);
    return entity;
  }

  async getById(id: string): Promise<${n.Pascal}> {
    const entity = await this.${n.camelPlural}.findById(id);
    if (!entity) throw new ${n.Pascal}NotFoundError(id);
    return entity;
  }

  list(query: ${n.Pascal}ListQuery): Promise<Page<${n.Pascal}>> {
    return this.${n.camelPlural}.list(query);
  }

  async update(id: string, input: Update${n.Pascal}Input): Promise<${n.Pascal}> {
    const entity = await this.getById(id);
    entity.update(input);
    await this.${n.camelPlural}.update(entity);
    return entity;
  }

  async delete(id: string): Promise<void> {
    if (!(await this.${n.camelPlural}.delete(id))) throw new ${n.Pascal}NotFoundError(id);
  }
}
`,

    [`${base}/application/${n.kebabPlural}.service.spec.ts`]: `import { ${n.Pascal}NotFoundError } from '../domain/${n.kebab}.errors.js';
import type { ${n.Pascal}Repository } from '../domain/${n.kebab}.repository.js';
import { ${n.PascalPlural}Service } from './${n.kebabPlural}.service.js';

describe('${n.PascalPlural}Service', () => {
  const repo = {
    findById: vi.fn(),
    list: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  } satisfies Record<keyof ${n.Pascal}Repository, unknown>;
  const service = new ${n.PascalPlural}Service(repo as unknown as ${n.Pascal}Repository);

  beforeEach(() => vi.resetAllMocks());

  it('creates and persists a ${n.label}', async () => {
    const created = await service.create({ name: '  First  ' });
    expect(created.name).toBe('First');
    expect(repo.insert).toHaveBeenCalledWith(created);
  });

  it('throws when the ${n.label} does not exist', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.getById('missing')).rejects.toBeInstanceOf(${n.Pascal}NotFoundError);
  });
});
`,

    [`${base}/infrastructure/${n.kebabPlural}.table.ts`]: `import type { ColumnType, Insertable, Selectable, Updateable } from 'kysely';

/** Kysely table type (camelCase; mapped to snake_case by CamelCasePlugin). Keep in sync with migrations. */
export interface ${n.PascalPlural}Table {
  id: string;
  name: string;
  description: string | null;
  createdAt: ColumnType<Date, Date | undefined, never>;
  updatedAt: ColumnType<Date, Date | undefined, Date>;
}

export type ${n.Pascal}Row = Selectable<${n.PascalPlural}Table>;
export type New${n.Pascal}Row = Insertable<${n.PascalPlural}Table>;
export type ${n.Pascal}RowUpdate = Updateable<${n.PascalPlural}Table>;
`,

    [`${base}/infrastructure/${n.kebab}.mapper.ts`]: `import { ${n.Pascal} } from '../domain/${n.kebab}.js';
import type { New${n.Pascal}Row, ${n.Pascal}Row, ${n.Pascal}RowUpdate } from './${n.kebabPlural}.table.js';

export const ${n.Pascal}Mapper = {
  toDomain(row: ${n.Pascal}Row): ${n.Pascal} {
    return ${n.Pascal}.restore({ ...row });
  },
  toInsert(entity: ${n.Pascal}): New${n.Pascal}Row {
    return { ...entity.toSnapshot() };
  },
  toUpdate(entity: ${n.Pascal}): ${n.Pascal}RowUpdate {
    const { id: _id, createdAt: _createdAt, ...rest } = entity.toSnapshot();
    return rest;
  },
};
`,

    [`${base}/infrastructure/kysely-${n.kebab}.repository.ts`]: `import { Injectable } from '@nestjs/common';
import { escapeLike } from '../../../infrastructure/database/query-helpers.js';
import { InjectDb, type DbTransactionHost } from '../../../infrastructure/database/transaction.js';
import { buildPage, toOffset, type Page } from '../../../shared/pagination/index.js';
import type { ${n.Pascal} } from '../domain/${n.kebab}.js';
import { ${n.Pascal}Repository, type ${n.Pascal}ListQuery } from '../domain/${n.kebab}.repository.js';
import { ${n.Pascal}Mapper } from './${n.kebab}.mapper.js';

@Injectable()
export class Kysely${n.Pascal}Repository extends ${n.Pascal}Repository {
  constructor(@InjectDb() private readonly db: DbTransactionHost) {
    super();
  }

  async findById(id: string): Promise<${n.Pascal} | null> {
    const row = await this.db.tx.selectFrom('${n.camelPlural}').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? ${n.Pascal}Mapper.toDomain(row) : null;
  }

  async list(query: ${n.Pascal}ListQuery): Promise<Page<${n.Pascal}>> {
    let base = this.db.tx.selectFrom('${n.camelPlural}');
    if (query.search) base = base.where('name', 'ilike', '%' + escapeLike(query.search) + '%');

    const [rows, total] = await Promise.all([
      base
        .selectAll()
        .orderBy('createdAt', 'desc')
        .orderBy('id', 'desc')
        .limit(query.limit)
        .offset(toOffset(query))
        .execute(),
      base.select((eb) => eb.fn.countAll<string>().as('count')).executeTakeFirstOrThrow(),
    ]);
    return buildPage(rows.map((row) => ${n.Pascal}Mapper.toDomain(row)), Number(total.count), query);
  }

  async insert(entity: ${n.Pascal}): Promise<void> {
    await this.db.tx.insertInto('${n.camelPlural}').values(${n.Pascal}Mapper.toInsert(entity)).execute();
  }

  async update(entity: ${n.Pascal}): Promise<void> {
    await this.db.tx
      .updateTable('${n.camelPlural}')
      .set(${n.Pascal}Mapper.toUpdate(entity))
      .where('id', '=', entity.id)
      .execute();
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.tx.deleteFrom('${n.camelPlural}').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
`,

    [`${base}/presentation/${n.kebabPlural}.schemas.ts`]: `import { z } from 'zod';
import { pageResponseSchema, paginationQuerySchema } from '../../../shared/pagination/index.js';

export const ${n.camel}IdParamSchema = z.uuid();

export const list${n.PascalPlural}QuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).max(100).optional(),
});
export type List${n.PascalPlural}Query = z.infer<typeof list${n.PascalPlural}QuerySchema>;

export const create${n.Pascal}Schema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().max(2000).nullable().optional(),
  })
  .meta({ id: 'Create${n.Pascal}Request' });
export type Create${n.Pascal}Request = z.infer<typeof create${n.Pascal}Schema>;

export const update${n.Pascal}Schema = create${n.Pascal}Schema
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'at least one field is required')
  .meta({ id: 'Update${n.Pascal}Request' });
export type Update${n.Pascal}Request = z.infer<typeof update${n.Pascal}Schema>;

export const ${n.camel}ResponseSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    description: z.string().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: '${n.Pascal}' });
export type ${n.Pascal}Response = z.infer<typeof ${n.camel}ResponseSchema>;

export const ${n.camel}PageResponseSchema = pageResponseSchema(${n.camel}ResponseSchema).meta({ id: '${n.Pascal}Page' });
`,

    [`${base}/presentation/${n.kebab}.presenter.ts`]: `import type { ${n.Pascal} } from '../domain/${n.kebab}.js';
import type { ${n.Pascal}Response } from './${n.kebabPlural}.schemas.js';

export function to${n.Pascal}Response(entity: ${n.Pascal}): ${n.Pascal}Response {
  return {
    id: entity.id,
    name: entity.name,
    description: entity.description,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}
`,

    [`${base}/presentation/${n.kebabPlural}.controller.ts`]: `import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblem, ApiProblemResponses } from '../../../core/http/problem-details.js';
import { mapPage, type Page } from '../../../shared/pagination/index.js';
import { ${n.PascalPlural}Service } from '../application/${n.kebabPlural}.service.js';
import { to${n.Pascal}Response } from './${n.kebab}.presenter.js';
import {
  create${n.Pascal}Schema,
  list${n.PascalPlural}QuerySchema,
  update${n.Pascal}Schema,
  ${n.camel}IdParamSchema,
  ${n.camel}PageResponseSchema,
  ${n.camel}ResponseSchema,
  type Create${n.Pascal}Request,
  type List${n.PascalPlural}Query,
  type Update${n.Pascal}Request,
  type ${n.Pascal}Response,
} from './${n.kebabPlural}.schemas.js';

@ApiTags('${n.PascalPlural}')
@ApiProblemResponses()
@Controller({ path: '${n.kebabPlural}', version: '1' })
export class ${n.PascalPlural}Controller {
  constructor(private readonly ${n.camelPlural}: ${n.PascalPlural}Service) {}

  @Post()
  @ApiOperation({ summary: 'Create a ${n.label}' })
  @ApiCreatedResponse({ standardSchema: ${n.camel}ResponseSchema })
  async create(@Body({ schema: create${n.Pascal}Schema }) body: Create${n.Pascal}Request): Promise<${n.Pascal}Response> {
    return to${n.Pascal}Response(await this.${n.camelPlural}.create(body));
  }

  @Get()
  @ApiOperation({ summary: 'List ${n.label}s' })
  @ApiOkResponse({ standardSchema: ${n.camel}PageResponseSchema })
  async list(@Query({ schema: list${n.PascalPlural}QuerySchema }) query: List${n.PascalPlural}Query): Promise<Page<${n.Pascal}Response>> {
    return mapPage(await this.${n.camelPlural}.list(query), to${n.Pascal}Response);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a ${n.label}' })
  @ApiOkResponse({ standardSchema: ${n.camel}ResponseSchema })
  @ApiProblem(404, '\`${n.CONST}_NOT_FOUND\`')
  async get(@Param('id', { schema: ${n.camel}IdParamSchema }) id: string): Promise<${n.Pascal}Response> {
    return to${n.Pascal}Response(await this.${n.camelPlural}.getById(id));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a ${n.label}' })
  @ApiOkResponse({ standardSchema: ${n.camel}ResponseSchema })
  @ApiProblem(404, '\`${n.CONST}_NOT_FOUND\`')
  async update(
    @Param('id', { schema: ${n.camel}IdParamSchema }) id: string,
    @Body({ schema: update${n.Pascal}Schema }) body: Update${n.Pascal}Request,
  ): Promise<${n.Pascal}Response> {
    return to${n.Pascal}Response(await this.${n.camelPlural}.update(id, body));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a ${n.label}' })
  @ApiNoContentResponse()
  @ApiProblem(404, '\`${n.CONST}_NOT_FOUND\`')
  async remove(@Param('id', { schema: ${n.camel}IdParamSchema }) id: string): Promise<void> {
    await this.${n.camelPlural}.delete(id);
  }
}
`,

    [`${base}/${n.kebabPlural}.module.ts`]: `import { Module } from '@nestjs/common';
import { ${n.PascalPlural}Service } from './application/${n.kebabPlural}.service.js';
import { ${n.Pascal}Repository } from './domain/${n.kebab}.repository.js';
import { Kysely${n.Pascal}Repository } from './infrastructure/kysely-${n.kebab}.repository.js';
import { ${n.PascalPlural}Controller } from './presentation/${n.kebabPlural}.controller.js';

@Module({
  controllers: [${n.PascalPlural}Controller],
  providers: [${n.PascalPlural}Service, { provide: ${n.Pascal}Repository, useClass: Kysely${n.Pascal}Repository }],
  exports: [${n.PascalPlural}Service],
})
export class ${n.PascalPlural}Module {}
`,

    [`${base}/index.ts`]: `/** Public API of the ${n.kebabPlural} feature. Other features import from here only. */
export { ${n.PascalPlural}Module } from './${n.kebabPlural}.module.js';
export { ${n.PascalPlural}Service } from './application/${n.kebabPlural}.service.js';
export { ${n.Pascal} } from './domain/${n.kebab}.js';
export * from './domain/${n.kebab}.errors.js';
`,

    [`infrastructure/database/migrations/${timestamp()}_create_${n.table}.ts`]: `import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('${n.table}')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('name', 'varchar(200)', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql\`now()\`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql\`now()\`))
    .execute();

  await db.schema.createIndex('${n.table}_created_at_idx').on('${n.table}').column('created_at').execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('${n.table}').execute();
}
`,
  };
}

function timestamp(): string {
  return new Date().toISOString().replace(/\D/g, '').slice(0, 14);
}

// ---------------------------------------------------------------------------
// Registration (anchor-based edits)
// ---------------------------------------------------------------------------
async function insertAtAnchor(
  file: string,
  anchor: string,
  line: string,
  importLine: string,
): Promise<void> {
  let content = await readFile(file, 'utf8');
  if (!content.includes(anchor)) throw new Error(`Anchor "${anchor}" missing in ${file}`);
  if (content.includes(line.trim())) return;

  const anchorLine = content.split('\n').find((l) => l.includes(anchor))!;
  const indent = anchorLine.match(/^\s*/)![0];
  content = content.replace(anchorLine, `${indent}${line.trim()}\n${anchorLine}`);

  const lines = content.split('\n');
  const lastImport = lines.findLastIndex((l) => l.startsWith('import '));
  lines.splice(lastImport + 1, 0, importLine);
  await writeFile(file, lines.join('\n'));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const name = args.find((a) => !a.startsWith('--'));
  const pluralIdx = args.indexOf('--plural');
  const dryRun = args.includes('--dry-run');

  if (!name || !/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) {
    throw new Error(
      'Usage: pnpm gen:feature <singular-kebab-name> [--plural <plural>] [--dry-run]',
    );
  }
  const plural = pluralIdx >= 0 ? args[pluralIdx + 1] : pluralize(name);
  if (!plural || !/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(plural))
    throw new Error('Invalid --plural value');

  const n = buildNames(name, plural);
  const featureDir = join(SRC, 'modules', n.kebabPlural);
  if (existsSync(featureDir))
    throw new Error(`Feature already exists: ${relative(ROOT, featureDir)}`);

  const files = templates(n);
  for (const [path, content] of Object.entries(files)) {
    const target = join(SRC, path);
    console.log(`${dryRun ? '[dry-run] ' : ''}create  src/${path}`);
    if (dryRun) continue;
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, { flag: 'wx' });
  }

  if (!dryRun) {
    await insertAtAnchor(
      join(SRC, 'modules', 'index.ts'),
      '<gen:modules>',
      `${n.PascalPlural}Module,`,
      `import { ${n.PascalPlural}Module } from './${n.kebabPlural}/index.js';`,
    );
    await insertAtAnchor(
      join(SRC, 'infrastructure', 'database', 'database.schema.ts'),
      '<gen:tables>',
      `${n.camelPlural}: ${n.PascalPlural}Table;`,
      `import type { ${n.PascalPlural}Table } from '../../modules/${n.kebabPlural}/infrastructure/${n.kebabPlural}.table.js';`,
    );
    console.log('update  src/modules/index.ts');
    console.log('update  src/infrastructure/database/database.schema.ts');
  }

  console.log(`
✔ Feature "${n.kebabPlural}" scaffolded.

Next steps:
  1. Adjust fields in domain/${n.kebab}.ts, the table type, the migration and the schemas
  2. pnpm db:migrate
  3. pnpm typecheck && pnpm lint && pnpm test
  4. Open http://localhost:3000/docs → "${n.PascalPlural}"
  5. Decide access rules: add @Roles(...) or @Public() in the controller
`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
