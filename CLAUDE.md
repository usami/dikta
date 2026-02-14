# Dikta — Project Conventions

## Monorepo Structure

```
dikta/
  packages/
    core/          @dikta/core — Intent Schema Definition Engine
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

## File Organization

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

## Documentation Maintenance

After completing any work in this repository, update the relevant documentation to reflect the changes:

- **This file (`CLAUDE.md`)** — update File Organization, Naming Conventions, Key Patterns, or Commands sections if new files, types, patterns, or scripts were added/changed
- **`README.md`** — update if public API surface, usage examples, or project scope changed
- **JSDoc on public APIs** — add or update when signatures or behavior change
- **`__tests__/`** — ensure new or changed behavior has corresponding test coverage
