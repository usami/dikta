# Dikta — Project Conventions

## Monorepo Structure

```
dikta/
  packages/
    core/              @dikta/core — Intent Schema Definition Engine
    agent-protocol/    @dikta/agent-protocol — Agent-Facing Protocol
    generator/         @dikta/generator — Code Generation Engine
    migration/         @dikta/migration — Verified Migration Planner
```

- pnpm workspace, ESM-only
- `pnpm build` / `pnpm test` / `pnpm typecheck` from root

## Commands

```bash
pnpm build       # tsup → dist/ (.js + .d.ts)
pnpm test        # vitest
pnpm typecheck   # tsc --noEmit
```

## Key Patterns

### Phantom types

`FieldDefinition<T, K>` has `_type: T` — never assigned at runtime.
`typeof entity.infer` resolves the entity shape statically.

### const generics

`defineEntity<const Name, const Fields>()` and `enumField<const V>()` preserve literal types.
Without `const`, TS widens literals to their base types.

### Freeze-and-cast

Field builders return `Object.freeze({...}) as FieldDefinition<T, K>`.
The cast is safe because `_type` is phantom (never accessed at runtime).

## Naming Conventions

- **FieldKind**: `"uuid" | "string" | "decimal" | "integer" | "boolean" | "timestamp" | "enum" | "ref"`
- **FieldRole**: `"identifier" | "monetary" | "audit_timestamp" | "display_name" | "description" | "status" | "quantity" | "reference" | "general"`
- **Policy keys**: `pii`, `retention`, `external_exposure`, `access`
- **CascadeRule**: `"soft_delete" | "cascade" | "restrict" | "set_null"`
- **ParamKind**: `"uuid" | "string" | "int" | "decimal" | "boolean" | "timestamp"` — uses `"int"` not `"integer"`
- **ShapeKind**: `"uuid" | "string" | "decimal" | "integer" | "int" | "boolean" | "timestamp"` — accepts both `"int"` and `"integer"`
- **ScanStrategy**: `"index_only" | "seq_scan_ok"`
- **PaginationKind**: `"cursor" | "offset"`
- **SafetyLevel**: `"safe" | "caution" | "dangerous"`
- **ImpactSeverity**: `"breaking" | "compatible" | "informational"`
- **SchemaChange kind**: `"add_entity" | "remove_entity" | "rename_entity" | "add_field" | "remove_field" | "rename_field" | "alter_field" | "add_invariant" | "remove_invariant"`
- **TaskKind**: `"implement_query" | "add_entity" | "modify_schema" | "fix_contract_violation"`
- **ViolationKind**: `"scan_strategy" | "max_rows" | "row_filter" | "max_joins" | "validation_error" | "performance_conflict"`
- **DatabaseTarget**: `"postgresql" | "mysql"`

## File Organization

### packages/core

- `src/fields/` — field builders and types
- `src/entity.ts` — defineEntity + type inference
- `src/registry.ts` — runtime entity collection
- `src/serialize.ts` — JSON round-trip
- `src/query/` — query contract system
  - `types.ts` — ParamKind, ShapeKind, QueryContractConfig, InferParams/InferResult
  - `contract.ts` — defineQuery + const generics
  - `registry.ts` — createQueryRegistry + validation against entity schema
  - `verifier.ts` — skeleton SQL verification (LIMIT, WHERE, scan strategy)
- `__tests__/` — vitest tests
  - `__tests__/query/` — contract, type-inference, registry, verifier

### packages/generator

- `src/types.ts` — GeneratedFile, CodeGenerator interface, DatabaseTarget, SQLDialect
- `src/file.ts` — header comment, naming utils (toSnakeCase, toPascalCase, toCamelCase)
- `src/manifest.ts` — SHA-256 hashing, manifest.json generation
- `src/generator.ts` — orchestrator: composes target modules via `createGenerator(target)` dispatch
- `src/config.ts` — DiktaConfig type + config file discovery
- `src/cli.ts` — commander CLI (generate, verify, context commands)
- `src/index.ts` — public API barrel
- `src/targets/postgresql/`
  - `types.ts` — FieldKind->PG type, ParamKind->TS type, CascadeRule->PG mapping
  - `dialect.ts` — PostgreSQLDialect implementing SQLDialect interface
  - `topo-sort.ts` — Kahn's algorithm for FK dependency ordering
  - `ddl.ts` — CREATE TABLE, INDEX, COMMENT generation
  - `access.ts` — typed query functions (postgres.js sql tagged template)
  - `validator.ts` — invariant pattern matching -> check functions
  - `test.ts` — contract test file generation
- `src/targets/mysql/`
  - `types.ts` — FieldKind->MySQL type, ParamKind->TS type, CascadeRule->MySQL mapping
  - `dialect.ts` — MySQLDialect implementing SQLDialect interface
  - `topo-sort.ts` — re-exports from postgresql (DB-agnostic)
  - `ddl.ts` — CREATE TABLE with backtick quoting, ENGINE=InnoDB, native ENUM(), CONSTRAINT FOREIGN KEY, inline COMMENT
  - `access.ts` — typed query functions (mysql2/promise Pool, `?` placeholders, pool.execute())
  - `validator.ts` — re-exports from postgresql (DB-agnostic)
  - `test.ts` — re-exports from postgresql (DB-agnostic)
- `__tests__/` — topo-sort, ddl, access, validator, test-gen, manifest, generator, dialect, mysql-dialect, mysql-ddl, mysql-access

### packages/agent-protocol

- `src/types.ts` — AgentContext, AgentTask, ViolationReport, AgentProtocolConfig types
- `src/context-generator.ts` — generateAgentContext: EntityRegistry + QueryRegistry -> AgentContext
- `src/task-protocol.ts` — AgentTask factory functions (implementQueryTask, addEntityTask, etc.)
- `src/violation-reporter.ts` — buildViolationReport: validation errors + SQL verification -> ViolationReport
- `src/instructions.ts` — generateInstructions: AgentContext -> markdown instructions
- `src/index.ts` — public API barrel
- `__tests__/` — context-generator, task-protocol, violation-reporter, instructions

### packages/migration

- `src/types.ts` — SchemaChange (discriminated union), FieldSpec, Safety/Impact/Migration types
- `src/definition.ts` — defineMigration API, change builders (addEntity, removeField, etc.), fieldDefinitionToSpec
- `src/planner.ts` — planMigration: schema diff engine comparing two EntityRegistry instances
- `src/safety.ts` — evaluateSafety: PostgreSQL-specific risk evaluation per change kind
- `src/impact.ts` — analyzeImpact: query contract impact analysis (breaking/compatible/informational)
- `src/sql-generator.ts` — generateMigrationFiles/Directory: up.sql, down.sql, verify.sql, metadata.json
- `src/index.ts` — public API barrel
- `__tests__/` — definition, planner, safety, impact, sql-generator, integration

## Documentation Maintenance

After completing any work in this repository, update the relevant documentation to reflect the changes:

- **This file (`CLAUDE.md`)** — update File Organization, Naming Conventions, Key Patterns, or Commands sections if new files, types, patterns, or scripts were added/changed
- **`README.md`** — update if public API surface, usage examples, or project scope changed
- **JSDoc on public APIs** — add or update when signatures or behavior change
- **`__tests__/`** — ensure new or changed behavior has corresponding test coverage
