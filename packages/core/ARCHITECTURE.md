# @dikta/core — Architecture

## Package Structure

```
packages/core/src/
  policy.ts          FieldPolicy interface (pii, retention, exposure, access)
  invariant.ts       Invariant type alias (string for Phase 1)
  fields/
    types.ts         FieldKind, FieldRole, FieldDefinition<T,K>, helpers
    primitives.ts    uuid, string, decimal, integer, boolean, timestamp
    enum.ts          enumField<const V> with literal union inference
    ref.ts           ref() with cascade rules
  entity.ts          defineEntity<const Name, const Fields>, type inference
  registry.ts        createRegistry() — lookup, policy search, relationships
  serialize.ts       JSON round-trip (version 1 format)
  types.ts           Type re-exports
  index.ts           Public API barrel
```

## Data Flow

```
Field builders (uuid, string, enumField, ref, ...)
  |
  v
FieldDefinition<T, K>  — frozen plain objects with phantom _type
  |
  v
defineEntity({ name, fields, invariants, query_hints })
  |
  v
EntityDefinition<Name, Fields>  — frozen, with phantom .infer
  |
  v
createRegistry(entities[])
  |
  v
EntityRegistry  — get/list/findFieldsWithPolicy/getRelationships/serialize
  |
  v
serializeRegistry() / deserializeRegistry()  — JSON round-trip
```

## Dependency Graph

```
index.ts
  +-- fields/primitives.ts  --> fields/types.ts --> policy.ts
  +-- fields/enum.ts         --> fields/types.ts
  +-- fields/ref.ts          --> fields/types.ts
  +-- entity.ts              --> fields/types.ts, invariant.ts
  +-- registry.ts            --> entity.ts, policy.ts, fields/ref.ts, serialize.ts
  +-- serialize.ts           --> entity.ts, fields/*.ts, registry.ts
  +-- types.ts               (re-exports only)
```

Note: `registry.ts` and `serialize.ts` have a mutual dependency
(`registry.serialize()` calls `serializeRegistry()`, and
`deserializeRegistry()` calls `createRegistry()`). This is safe because
the calls are deferred (inside functions, not at module evaluation time).

## Type Inference Chain

```
uuid()                              -> FieldDefinition<string, "uuid">
enumField(["a","b"] as const)       -> FieldDefinition<"a"|"b", "enum">
defineEntity({ fields: { f: ... }}) -> EntityDefinition<Name, Fields>
typeof entity.infer                 -> { readonly f: string; ... }
```

The `_type: T` phantom field on `FieldDefinition` is the anchor.
`InferFieldType<F>` extracts `T` via conditional type inference.
`InferEntityFields<Fields>` maps over the fields record.
`const` type parameters on `defineEntity` and `enumField` preserve
literal types through the chain.
