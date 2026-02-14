# @dikta/core — Technical Decisions

## Phantom types for type inference

**Decision**: `FieldDefinition<T, K>` carries `_type: T` that exists only at the type level.

**Alternatives considered**:
- Branded types (`string & { __brand: "uuid" }`) — muddies the inferred user-facing type
- Symbol keys — cannot carry generic type information
- Class-based fields — unnecessary runtime overhead for what is purely a type-level concern

**Rationale**: Phantom fields are the standard TypeScript pattern for carrying type
information without runtime cost. `typeof field._type` resolves statically, and the
property is never accessed at runtime.

## `const` type parameters for literal preservation

**Decision**: `defineEntity<const Name, const Fields>()` and
`enumField<const V extends readonly string[]>()` use `const` type parameters.

**Rationale**: Without `const`, TypeScript widens `"User"` to `string` and
`["a", "b"]` to `string[]`. The `const` modifier (TS 5.0+) preserves literal
types without requiring `as const` at every call site.

## Flat policy options on field builders

**Decision**: Policy fields (`pii`, `retention`, `external_exposure`, `access`) are
spread directly into `CommonFieldOptions` rather than nested under a `policy` key.

**Rationale**: `string({ pii: true })` is more ergonomic than
`string({ policy: { pii: true } })`. The flat structure also makes it easier to
scan field definitions visually. The `extractPolicy()` helper collects them into
a structured `FieldPolicy` object internally.

## `Object.freeze` for immutability

**Decision**: All returned objects (fields, entities, registries) are frozen.

**Alternatives considered**:
- Deep freeze libraries (e.g., `deep-freeze-strict`) — unnecessary since our
  objects are shallow; nested objects like `policy` and `query_hints` are also frozen
- `Readonly<T>` only — provides type-level protection but no runtime enforcement

**Rationale**: `Object.freeze` + `readonly` types gives both compile-time and
runtime immutability guarantees. Our data structures are intentionally shallow,
so a single-level freeze is sufficient.

## Field builders as functions returning plain objects

**Decision**: `uuid()`, `string()`, etc. are factory functions returning frozen
plain objects, not class instances.

**Rationale**: Plain objects serialize cleanly to JSON, compare easily in tests,
and carry no prototype chain. Classes would add complexity (constructor, inheritance)
for no benefit — the objects are inert data with no methods.

## Serialization version field

**Decision**: Serialized JSON includes `{ version: 1 }`.

**Rationale**: Forward compatibility. If the schema format changes in future phases,
`deserializeRegistry()` can detect the version and either migrate or reject with
a clear error message.

## `string` function name coexisting with TS primitive type

**Decision**: The `string()` field builder shadows the TypeScript `string` type
within its import scope.

**Rationale**: Within `@dikta/core`, the `string` identifier in type position refers
to the TS primitive type, and in value position refers to the field builder function.
TypeScript's namespace separation handles this cleanly — `string` (type) and
`string` (value) coexist without conflict. This matches the user's mental model:
"I want a string field."

## Registry erases generics

**Decision**: `EntityRegistry.get()` returns `EntityDefinition` (with erased generics),
not `EntityDefinition<Name, Fields>`.

**Rationale**: The registry stores heterogeneous entities in a `Map<string, EntityDefinition>`.
TypeScript cannot preserve per-entity generic types in a homogeneous collection.
Type inference works at the definition site (`typeof entity.infer`), not at the
registry lookup site. This is a deliberate tradeoff: registries are for runtime
operations (policy scanning, serialization), while type inference operates on
individual entity definitions.
