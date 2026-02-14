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

## File Organization

- `src/fields/` — field builders and types
- `src/entity.ts` — defineEntity + type inference
- `src/registry.ts` — runtime entity collection
- `src/serialize.ts` — JSON round-trip
- `__tests__/` — vitest tests (type-inference, fields, entity, registry, serialize)
