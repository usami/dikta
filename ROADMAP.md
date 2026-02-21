# Dikta Development Roadmap

## Context

Dikta is a schema-first code generation monorepo with 4 packages: core, generator, agent-protocol, migration. Currently PostgreSQL-only. The `CodeGenerator` interface and `DiktaConfig.target` field already exist as extension points, making multi-DB support a natural next step.

---

## Priority 1: MySQL Target Support

### Phase 1 — Dialect Abstraction Layer ✅

- [x] Define `SQLDialect` interface (type mapping, identifier quoting, placeholder style)
- [x] Extract PostgreSQL-specific logic into a concrete `PostgreSQLDialect`
- [x] Enable `DiktaConfig.target` dispatch in CLI (`cli.ts`)
- [x] Add `createGenerator(target)` factory with target-aware dispatch
- [x] Export `DatabaseTarget`, `SQLDialect` types from public API
- Files modified:
  - `packages/generator/src/types.ts` — `DatabaseTarget` type, `SQLDialect` interface
  - `packages/generator/src/generator.ts` — `createGenerator(target)` dispatch
  - `packages/generator/src/cli.ts` — reads `config.target`
  - `packages/generator/src/targets/postgresql/dialect.ts` — `PostgreSQLDialect` implementation

### Phase 2 — MySQL Generator ✅

- [x] Create `packages/generator/src/targets/mysql/`
  - `types.ts` — FieldKind to MySQL type mapping (UUID->CHAR(36), TIMESTAMPTZ->DATETIME, etc.)
  - `ddl.ts` — backtick quoting, ENGINE=InnoDB, native ENUM() type, CONSTRAINT FOREIGN KEY, inline COMMENT
  - `access.ts` — mysql2/promise driver, `?` placeholder style, `pool.execute()` pattern
  - `validator.ts` — reuses PostgreSQL (invariant validation is DB-agnostic)
  - `test.ts` — reuses PostgreSQL (contract test generation is DB-agnostic)
  - `topo-sort.ts` — reuses PostgreSQL (FK ordering is DB-agnostic)
  - `dialect.ts` — `MySQLDialect` implementing `SQLDialect` interface
- [x] Wire `createMySQLGenerator()` into `createGenerator("mysql")` dispatch
- [x] Fix `generateAll()` to route DDL through the generator (was hardcoded to PostgreSQL)
- [x] Export MySQL types, dialect, and generator from public API
- Files modified:
  - `packages/generator/src/targets/mysql/` — all 7 files listed above
  - `packages/generator/src/generator.ts` — `createMySQLGenerator()` + dispatch + `generateAll()` fix
  - `packages/generator/src/types.ts` — `CodeGenerator.generateDDL()` accepts optional `queries`
  - `packages/generator/src/index.ts` — export MySQL public API

### Phase 3 — MySQL Migration

- Abstract migration dialect in `packages/migration/`
  - `sql-generator.ts` — MySQL DDL dialect (MODIFY COLUMN vs ALTER COLUMN TYPE)
  - `safety.ts` — MySQL-specific risk evaluation (ALGORITHM=INSTANT/INPLACE/COPY)
  - Verify SQL using MySQL `information_schema` (similar but not identical to PG)

---

## Priority 2: SQLite Target

- Lightweight target for local dev / testing
- Simpler type system (TEXT, INTEGER, REAL, BLOB)
- No ALTER COLUMN — migration requires table rebuild pattern
- Driver: better-sqlite3

---

## Priority 3: Runtime Validation Generation

- Generate Zod / Valibot schemas from `@dikta/core` entity definitions
- Reuse phantom type information for compile-time + runtime safety
- Output: `validators.ts` per entity with parse/safeParse functions

---

## Priority 4: OpenAPI Specification Generation

- Generate OpenAPI 3.1 spec from entity + query contracts
- Entity -> schema components, Query -> path operations
- Include pagination, error responses from query contract metadata

---

## Priority 5: GraphQL Schema Generation

- Entity -> GraphQL Object Types
- Query contracts -> Query/Mutation resolvers
- Leverage ref fields for automatic relationship resolution

---

## Priority 6: Utility Targets

- **Seed data generator** — faker.js-based test data from entity definitions
- **ER diagram** — Mermaid diagram generation from entity registry
- **Multi-version migration chain** — sequential migration application with rollback support
