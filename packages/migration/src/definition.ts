import type { FieldDefinition } from "@dikta/core";
import type {
  SchemaChange,
  AddEntityChange,
  RemoveEntityChange,
  RenameEntityChange,
  AddFieldChange,
  RemoveFieldChange,
  RenameFieldChange,
  AlterFieldChange,
  AddInvariantChange,
  RemoveInvariantChange,
  FieldSpec,
  FieldAlterations,
  MigrationConfig,
  MigrationDefinition,
} from "./types.js";

// ── FieldDefinition -> FieldSpec bridge ─────────────────────

interface EnumLike {
  readonly values: readonly string[];
}

interface RefLike {
  readonly entity: string;
  readonly cascade: string;
}

/** Convert a core FieldDefinition (with phantom types) to a plain FieldSpec. */
export function fieldDefinitionToSpec(field: FieldDefinition): FieldSpec {
  const spec: Record<string, unknown> = {
    kind: field.kind,
  };

  if (field.nullable) spec["nullable"] = true;
  if (field.role !== "general") spec["role"] = field.role;
  if (field.description) spec["description"] = field.description;
  if (Object.keys(field.policy).length > 0) spec["policy"] = field.policy;

  if (field.kind === "enum") {
    const enumField = field as unknown as EnumLike;
    spec["values"] = enumField.values;
  }

  if (field.kind === "ref") {
    const refField = field as unknown as RefLike;
    spec["entity"] = refField.entity;
    spec["cascade"] = refField.cascade;
  }

  return Object.freeze(spec) as unknown as FieldSpec;
}

// ── Change builder helpers ──────────────────────────────────

function isFieldDefinition(value: unknown): value is FieldDefinition {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    "nullable" in value &&
    "role" in value &&
    "policy" in value
  );
}

// ── Change builders ─────────────────────────────────────────

export function addEntity(
  name: string,
  fields: Record<string, FieldSpec>,
): AddEntityChange {
  return Object.freeze({
    kind: "add_entity" as const,
    entity: name,
    fields: Object.freeze({ ...fields }),
  });
}

export function removeEntity(name: string): RemoveEntityChange {
  return Object.freeze({
    kind: "remove_entity" as const,
    entity: name,
  });
}

export function renameEntity(from: string, to: string): RenameEntityChange {
  return Object.freeze({
    kind: "rename_entity" as const,
    from,
    to,
  });
}

export function addField(
  entity: string,
  field: string,
  spec: FieldSpec | FieldDefinition,
  opts?: { readonly backfill?: string },
): AddFieldChange {
  const resolved = isFieldDefinition(spec) ? fieldDefinitionToSpec(spec) : spec;

  return Object.freeze({
    kind: "add_field" as const,
    entity,
    field,
    spec: Object.freeze({ ...resolved }),
    ...(opts?.backfill !== undefined && { backfill: opts.backfill }),
  });
}

export function removeField(entity: string, field: string): RemoveFieldChange {
  return Object.freeze({
    kind: "remove_field" as const,
    entity,
    field,
  });
}

export function renameField(
  entity: string,
  from: string,
  to: string,
): RenameFieldChange {
  return Object.freeze({
    kind: "rename_field" as const,
    entity,
    from,
    to,
  });
}

export function alterField(
  entity: string,
  field: string,
  changes: FieldAlterations,
): AlterFieldChange {
  return Object.freeze({
    kind: "alter_field" as const,
    entity,
    field,
    changes: Object.freeze({ ...changes }),
  });
}

export function addInvariant(
  entity: string,
  invariant: string,
): AddInvariantChange {
  return Object.freeze({
    kind: "add_invariant" as const,
    entity,
    invariant,
  });
}

export function removeInvariant(
  entity: string,
  invariant: string,
): RemoveInvariantChange {
  return Object.freeze({
    kind: "remove_invariant" as const,
    entity,
    invariant,
  });
}

// ── defineMigration ─────────────────────────────────────────

export function defineMigration(
  name: string,
  config: MigrationConfig,
): MigrationDefinition {
  if (!name || name.trim().length === 0) {
    throw new Error("Migration name must not be empty");
  }

  if (!config.changes || config.changes.length === 0) {
    throw new Error("Migration must contain at least one change");
  }

  // Validate each change has required fields
  for (const change of config.changes) {
    validateChange(change);
  }

  return Object.freeze({
    name,
    config: Object.freeze({
      ...config,
      changes: Object.freeze([...config.changes]),
    }),
  });
}

function validateChange(change: SchemaChange): void {
  switch (change.kind) {
    case "add_entity":
      if (!change.entity) throw new Error("add_entity requires entity name");
      if (!change.fields || Object.keys(change.fields).length === 0) {
        throw new Error(`add_entity "${change.entity}" requires at least one field`);
      }
      break;
    case "remove_entity":
      if (!change.entity) throw new Error("remove_entity requires entity name");
      break;
    case "rename_entity":
      if (!change.from || !change.to) throw new Error("rename_entity requires from and to");
      break;
    case "add_field":
      if (!change.entity || !change.field) throw new Error("add_field requires entity and field");
      if (!change.spec) throw new Error(`add_field "${change.entity}.${change.field}" requires spec`);
      break;
    case "remove_field":
      if (!change.entity || !change.field) throw new Error("remove_field requires entity and field");
      break;
    case "rename_field":
      if (!change.entity || !change.from || !change.to) {
        throw new Error("rename_field requires entity, from, and to");
      }
      break;
    case "alter_field":
      if (!change.entity || !change.field) throw new Error("alter_field requires entity and field");
      if (!change.changes || Object.keys(change.changes).length === 0) {
        throw new Error(`alter_field "${change.entity}.${change.field}" requires at least one alteration`);
      }
      break;
    case "add_invariant":
      if (!change.entity || !change.invariant) throw new Error("add_invariant requires entity and invariant");
      break;
    case "remove_invariant":
      if (!change.entity || !change.invariant) throw new Error("remove_invariant requires entity and invariant");
      break;
  }
}
