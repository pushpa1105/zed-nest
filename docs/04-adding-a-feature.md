# 04 · Adding a feature

## Option A: the generator (recommended)

```bash
pnpm gen:feature product                       # → src/modules/products, table "products"
pnpm gen:feature category --plural categories  # irregular plural
pnpm gen:feature order-item                    # → modules/order-items, table "order_items"
pnpm gen:feature product --dry-run             # show what would be created
```

The generator creates a complete, working CRUD slice that follows the same architecture as `users`:

```
src/modules/products/
├── domain/product.ts, product.repository.ts, product.errors.ts
├── application/products.service.ts (+ .spec.ts)
├── infrastructure/products.table.ts, product.mapper.ts, kysely-product.repository.ts
├── presentation/products.controller.ts, products.schemas.ts, product.presenter.ts
├── products.module.ts
└── index.ts
src/infrastructure/database/migrations/<timestamp>_create_products.ts
```

It also registers the module in `src/modules/index.ts` and the table in `src/infrastructure/database/database.schema.ts`.

Then:

```bash
# 1. edit fields: entity, table type, migration, schemas, presenter
pnpm db:migrate
pnpm typecheck && pnpm lint && pnpm test
pnpm start:dev                 # → /docs, "Products" section
```

> Generated endpoints require authentication (the default). Add `@Roles('admin')` or `@Public()` where needed.

## Option B: by hand (or to understand what was generated)

Work **inside-out**: domain → infrastructure → application → presentation → wiring.

### 1. Migration

```bash
pnpm db:migrate:create create_products
```

```ts
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('products')
    .addColumn('id', 'uuid', (c) => c.primaryKey())
    .addColumn('name', 'varchar(200)', (c) => c.notNull())
    .addColumn('price_cents', 'integer', (c) => c.notNull())
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
}
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('products').execute();
}
```

### 2. Domain: entity, port, errors

```ts
// domain/product.ts: pure TS, invariants live here
export class Product {
  private constructor(private readonly props: ProductProps) {}
  static create(input: { name: string; priceCents: number }): Product {
    if (input.priceCents < 0)
      throw new BusinessRuleError('Price cannot be negative', 'PRODUCT_NEGATIVE_PRICE');
    return new Product({
      id: generateId(),
      ...input,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  static restore(props: ProductProps) {
    return new Product({ ...props });
  }
  // getters + intention-revealing methods (rename, reprice, …)
}

// domain/product.repository.ts
export abstract class ProductRepository {
  abstract findById(id: string): Promise<Product | null>;
  abstract insert(product: Product): Promise<void>;
}

// domain/product.errors.ts
export class ProductNotFoundError extends NotFoundError {
  constructor(id: string) {
    super(`Product ${id} not found`, 'PRODUCT_NOT_FOUND');
  }
}
```

### 3. Infrastructure: table type, mapper, adapter

```ts
// infrastructure/products.table.ts (camelCase; CamelCasePlugin maps to snake_case)
export interface ProductsTable {
  id: string;
  name: string;
  priceCents: number;
  createdAt: ColumnType<Date, Date | undefined, never>;
  updatedAt: ColumnType<Date, Date | undefined, Date>;
}
```

Register it in `src/infrastructure/database/database.schema.ts`:

```ts
export interface Database {
  users: UsersTable;
  products: ProductsTable; // ← add
  // <gen:tables>
}
```

```ts
// infrastructure/kysely-product.repository.ts
@Injectable()
export class KyselyProductRepository extends ProductRepository {
  constructor(@InjectDb() private readonly db: DbTransactionHost) {
    super();
  }

  async findById(id: string) {
    const row = await this.db.tx
      .selectFrom('products')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? ProductMapper.toDomain(row) : null;
  }
}
```

Always query through `this.db.tx`, never the raw Kysely instance. That way the call joins any surrounding transaction.

### 4. Application: service

```ts
@Injectable()
export class ProductsService {
  constructor(private readonly products: ProductRepository) {}

  async create(input: CreateProductInput): Promise<Product> {
    const product = Product.create(input);
    await this.products.insert(product);
    return product;
  }
}
```

No `HttpException`, no `Request`, no SQL. Throw `AppError` subclasses.

### 5. Presentation: schemas, presenter, controller

```ts
// presentation/products.schemas.ts
export const createProductSchema = z
  .object({ name: z.string().trim().min(1).max(200), priceCents: z.number().int().min(0) })
  .meta({ id: 'CreateProductRequest' });
export type CreateProductRequest = z.infer<typeof createProductSchema>;

export const productResponseSchema = z
  .object({ id: z.uuid(), name: z.string(), priceCents: z.number() })
  .meta({ id: 'Product' });
```

```ts
// presentation/products.controller.ts
@ApiTags('Products')
@ApiProblemResponses()
@Controller({ path: 'products', version: '1' })
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Post()
  @Roles('admin')
  @ApiCreatedResponse({ standardSchema: productResponseSchema })
  async create(@Body({ schema: createProductSchema }) body: CreateProductRequest) {
    return toProductResponse(await this.products.create(body));
  }
}
```

### 6. Wiring

```ts
// products.module.ts
@Module({
  controllers: [ProductsController],
  providers: [ProductsService, { provide: ProductRepository, useClass: KyselyProductRepository }],
  exports: [ProductsService],
})
export class ProductsModule {}

// index.ts: the feature's public API
export { ProductsModule } from './products.module.js';
export { ProductsService } from './application/products.service.js';
```

Add `ProductsModule` to `FEATURE_MODULES` in `src/modules/index.ts`.

### 7. Tests

- Unit-test the entity and service (see `users.service.spec.ts`; use an in-memory repository).
- Add `test/products.e2e-spec.ts` for the HTTP contract (see `test/users.e2e-spec.ts`).

## Checklist before opening a PR

- [ ] Migration has a working `down()`
- [ ] Table type registered in `database.schema.ts`, module in `modules/index.ts`
- [ ] All inputs validated by Zod schemas; responses documented with `standardSchema`
- [ ] Access decided: default (authenticated), `@Roles(...)` or `@Public()`
- [ ] Errors are `AppError` subclasses with stable `code`s
- [ ] Presenter picks fields explicitly (no secrets leak)
- [ ] Unit tests for business rules; e2e test for the endpoints
- [ ] `pnpm validate` passes

## Adding an endpoint to an existing feature

1. Add or extend the Zod schema in `presentation/*.schemas.ts`.
2. Add the use-case method to the service. Add a port method if new data access is needed, then implement it in the adapter (and in the in-memory test double).
3. Add the controller method with `@ApiOperation`, `@ApiOkResponse({ standardSchema })` and one `@ApiProblem(status, code)` per error the client should handle.
4. Add tests.

## Using another feature

```ts
import { UsersService } from '../users/index.js'; // ✔ public API
import { UserRepository } from '../users/domain/...'; // ✖ internals
```

Import the other module (`imports: [UsersModule]`) and inject its exported service. For "something happened" reactions, subscribe to its events instead.
