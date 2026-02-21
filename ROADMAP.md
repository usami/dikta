# Dikta Development Roadmap

## Context

Dikta is a schema-first code generation monorepo with 4 packages: core, generator, agent-protocol, migration. Supports PostgreSQL and MySQL. The `CodeGenerator` interface, `DiktaConfig.target` field, and `MigrationDialect` abstraction provide extension points for additional database targets.

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

### Phase 3 — MySQL Migration ✅

- [x] Define `MigrationDialect` interface (quote, mapFieldType, mapCascade, enumColumnType, createTable, addColumn, alterColumn, dropColumn, dropTable, addCheckConstraint, dropConstraint, addForeignKey, verifyTable, verifyColumn)
- [x] Extract PostgreSQL-specific logic into `createPostgreSQLMigrationDialect()`
- [x] Create `packages/migration/src/dialects/mysql.ts`
  - Backtick quoting, `MODIFY COLUMN` (vs PG `ALTER COLUMN TYPE`), native `ENUM()`, `ENGINE=InnoDB`, `DROP FOREIGN KEY` (vs PG `DROP CONSTRAINT`)
- [x] Add `createMigrationDialect(target)` factory dispatch
- [x] Make `sql-generator.ts` target-aware via `MigrationDialect`
- [x] Make `safety.ts` target-aware (MySQL `ALGORITHM=INSTANT/INPLACE/COPY` notes, PG `pg_repack` notes)
- [x] Add MySQL migration tests (`mysql-sql-generator.test.ts`, `mysql-safety.test.ts`)
- Files modified:
  - `packages/migration/src/types.ts` — `MigrationDialect` interface
  - `packages/migration/src/dialects/postgresql.ts` — `createPostgreSQLMigrationDialect()`
  - `packages/migration/src/dialects/mysql.ts` — `createMySQLMigrationDialect()`
  - `packages/migration/src/dialects/factory.ts` — `createMigrationDialect(target)` dispatch
  - `packages/migration/src/sql-generator.ts` — routes DDL generation through dialect
  - `packages/migration/src/safety.ts` — target-aware risk evaluation
  - `packages/migration/src/index.ts` — export dialect factory + types

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
