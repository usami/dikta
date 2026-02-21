# Dikta Development Roadmap

## Context

Dikta is a schema-first code generation monorepo with 4 packages: core, generator, agent-protocol, migration. Supports PostgreSQL and MySQL. The `CodeGenerator` interface, `DiktaConfig.target` field, and `MigrationDialect` abstraction provide extension points for additional database targets.

### Completed

- **MySQL Target Support** — dialect abstraction, generator, migration (all 3 phases)
- **Runtime Validation Generation** — Zod schema generation from entity definitions

---

## Priority 1: SQLite Target

Lightweight target for local dev / testing. SQLite's limited ALTER TABLE support makes migration the most complex phase.

### Phase 1 — SQLite Generator

- [x] Create `packages/generator/src/targets/sqlite/`
  - `types.ts` — FieldKind to SQLite type mapping (UUID->TEXT, DECIMAL->REAL, BOOLEAN->INTEGER, TIMESTAMP->TEXT ISO-8601)
  - `dialect.ts` — `SQLiteDialect` implementing `SQLDialect` interface (double-quote identifiers, `?` placeholders)
  - `ddl.ts` — CREATE TABLE with SQLite constraints (no native ENUM — use CHECK, no COMMENT — use SQL comments)
  - `access.ts` — better-sqlite3 driver, synchronous API pattern
- [x] Wire `createSQLiteGenerator()` into `createGenerator("sqlite")` dispatch
- [x] Export SQLite types, dialect, and generator from public API
- [x] Add `"sqlite"` to `DatabaseTarget` union type

### Phase 2 — SQLite Migration

- [x] Create `packages/migration/src/dialects/sqlite.ts`
  - Table rebuild pattern for column alterations (CREATE new -> copy data -> DROP old -> RENAME)
  - No native `DROP COLUMN` before SQLite 3.35 — use rebuild
  - No `ALTER COLUMN TYPE` — always rebuild
  - ENUM via CHECK constraint migration
- [x] Wire into `createMigrationDialect("sqlite")` factory
- [x] Target-aware safety notes in `safety.ts` (table rebuild lock implications)

### Phase 3 — SQLite Tests

- [x] Generator tests: DDL output, access layer, type mapping
- [x] Migration tests: table rebuild correctness, data preservation
- [x] Integration test with better-sqlite3 in-memory database

---

## Priority 2: OpenAPI Specification Generation

Generate OpenAPI 3.1 spec from entity + query contracts. This is the first "API surface" generator — it reads from both EntityRegistry and QueryRegistry.

### Phase 1 — Entity Schema Components

- [x] Create `packages/generator/src/openapi/`
  - `schema.ts` — Entity -> OpenAPI Schema Object (FieldKind -> JSON Schema type/format mapping)
  - Handle nullable fields, enum fields (as `enum` keyword), ref fields (as `$ref`)
- [x] Wire into `CodeGenerator` interface as `generateOpenAPI()` method

### Phase 2 — Query Path Operations

- [x] `paths.ts` — QueryContract -> OpenAPI Path Item
  - Map ParamKind to query/path parameter schemas
  - Map ShapeKind result fields to response schema
  - Generate `operationId` from query contract name
- [x] Support pagination metadata (cursor/offset) in response schemas

### Phase 3 — Spec Assembly and Output

- [x] `spec.ts` — Assemble full OpenAPI 3.1 document (info, servers, paths, components)
- [x] Standard error response schemas (400, 404, 500)
- [x] CLI integration (`--openapi` flag) and `generateAll()` wiring
- [x] YAML and JSON output format support

---

## Priority 3: GraphQL Schema Generation

Entity -> GraphQL Object Types, Query contracts -> Query/Mutation resolvers. Ref fields enable automatic relationship resolution.

### Phase 1 — Type Definitions

- [ ] Create `packages/generator/src/graphql/`
  - `types.ts` — Entity -> GraphQL Object Type (FieldKind -> GraphQL scalar mapping)
  - Handle nullable (`String` vs `String!`), enum (GraphQL enum type), ref (object type reference)
- [ ] Wire into `CodeGenerator` interface as `generateGraphQL()` method

### Phase 2 — Query and Mutation Types

- [ ] `operations.ts` — QueryContract -> Query/Mutation field definitions
  - Map ParamKind to GraphQL input types / arguments
  - Map ShapeKind result to return types
  - Generate connection types for paginated queries (cursor/offset patterns)

### Phase 3 — Resolver Scaffolding

- [ ] `resolvers.ts` — Generate resolver stubs with typed context
  - Ref field -> nested resolver for relationship resolution
  - DataLoader pattern hints for N+1 prevention
- [ ] CLI integration (`--graphql` flag) and `generateAll()` wiring

---

## Priority 4: Utility Targets

Independent generators that consume EntityRegistry for non-database purposes.

### Phase 1 — ER Diagram

- [x] `packages/generator/src/diagram.ts` — Mermaid ER diagram from entity registry
  - Entity -> table block, ref fields -> relationship arrows
  - Cardinality notation from nullable FK semantics
- [x] CLI integration (`--diagram` flag)

### Phase 2 — Seed Data Generator

- [ ] `packages/generator/src/seed.ts` — faker.js-based test data generation
  - FieldRole -> appropriate faker method (monetary -> finance, display_name -> person, etc.)
  - Respect ref field FK ordering (topological sort)
  - Configurable row count per entity
- [ ] CLI integration (`--seed` flag)

### Phase 3 — Multi-Version Migration Chain

- [ ] `packages/migration/src/chain.ts` — Sequential migration application
  - Ordered migration discovery and dependency validation
  - Forward (up.sql) and backward (down.sql) execution
  - Migration state tracking (applied versions table)
- [ ] CLI integration for `migrate up`, `migrate down`, `migrate status`
