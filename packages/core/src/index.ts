// Field builders
export { uuid, string, decimal, integer, boolean, timestamp } from "./fields/primitives.js";
export { enumField } from "./fields/enum.js";
export { ref } from "./fields/ref.js";

// Entity
export { defineEntity } from "./entity.js";

// Registry
export { createRegistry } from "./registry.js";

// Serialization
export { serializeRegistry, deserializeRegistry } from "./serialize.js";

// Query contracts
export { defineQuery } from "./query/contract.js";
export { createQueryRegistry } from "./query/registry.js";
export { verifyMaxRows, verifyRowFilter, verifyScanStrategy } from "./query/verifier.js";

// Types
export type {
  FieldPolicy,
  Invariant,
  FieldKind,
  FieldRole,
  FieldDefinition,
  CommonFieldOptions,
  EnumFieldDefinition,
  RefFieldDefinition,
  CascadeRule,
  RefOptions,
  InferFieldType,
  InferEntityFields,
  QueryHints,
  EntityDefinition,
  EntityDefinitionOptions,
  EntityRegistry,
  Relationship,
  ParamKind,
  ParamKindToType,
  ParamDefinition,
  ShapeKind,
  ShapeKindToType,
  JoinShapeField,
  ShapeField,
  OrderingSpec,
  PaginationKind,
  ReturnsDefinition,
  ScanStrategy,
  PerformanceContract,
  SecurityContract,
  QueryContractConfig,
  QueryContract,
  InferParams,
  InferResult,
  ValidationError,
  PerformanceConflict,
  QueryRegistry,
  VerificationResult,
} from "./types.js";
