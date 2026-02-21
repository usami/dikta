import type {
  EntityRegistry,
  EntityDefinition,
  FieldDefinition,
  FieldPolicy,
  QueryRegistry,
} from "@dikta/core";
import type {
  SchemaChange,
  FieldSpec,
  FieldAlterations,
  MigrationPlan,
} from "./types.js";
import { fieldDefinitionToSpec } from "./definition.js";
import { analyzeImpact } from "./impact.js";
import { evaluateSafety } from "./safety.js";

// ── Internal type helpers ────────────────────────────────────

interface EnumLike {
  readonly values: readonly string[];
}

interface RefLike {
  readonly entity: string;
  readonly cascade: string;
}

// ── Schema diff engine ──────────────────────────────────────

export function planMigration(
  before: EntityRegistry,
  after: EntityRegistry,
  queries?: QueryRegistry,
): MigrationPlan {
  const changes = diffRegistries(before, after);
  const emptyImpact = { contracts: [], indexRecommendations: [], backfillRequirements: [] };

  const impact = queries
    ? analyzeImpact(changes, queries, after)
    : emptyImpact;
  const safety = evaluateSafety(changes);

  return Object.freeze({ changes, impact, safety });
}

function diffRegistries(
  before: EntityRegistry,
  after: EntityRegistry,
): readonly SchemaChange[] {
  const beforeMap = new Map<string, EntityDefinition>();
  const afterMap = new Map<string, EntityDefinition>();

  for (const entity of before.list()) {
    beforeMap.set(entity.name, entity);
  }
  for (const entity of after.list()) {
    afterMap.set(entity.name, entity);
  }

  const removals: SchemaChange[] = [];
  const alterations: SchemaChange[] = [];
  const additions: SchemaChange[] = [];

  // Detect removed entities
  for (const [name] of beforeMap) {
    if (!afterMap.has(name)) {
      removals.push(Object.freeze({ kind: "remove_entity" as const, entity: name }));
    }
  }

  // Detect added entities
  for (const [name, entity] of afterMap) {
    if (!beforeMap.has(name)) {
      const fields: Record<string, FieldSpec> = {};
      for (const [fieldName, field] of Object.entries(entity.fields)) {
        fields[fieldName] = fieldDefinitionToSpec(field);
      }
      additions.push(
        Object.freeze({
          kind: "add_entity" as const,
          entity: name,
          fields: Object.freeze(fields),
        }),
      );
    }
  }

  // Detect changes in common entities
  for (const [name, beforeEntity] of beforeMap) {
    const afterEntity = afterMap.get(name);
    if (!afterEntity) continue;

    // Diff fields
    const fieldChanges = diffFields(name, beforeEntity, afterEntity);
    alterations.push(...fieldChanges);

    // Diff invariants
    const invariantChanges = diffInvariants(name, beforeEntity, afterEntity);
    alterations.push(...invariantChanges);
  }

  // Order: removals first, then alterations, then additions
  return Object.freeze([...removals, ...alterations, ...additions]);
}

function diffFields(
  entityName: string,
  before: EntityDefinition,
  after: EntityDefinition,
): readonly SchemaChange[] {
  const changes: SchemaChange[] = [];
  const beforeFields = new Set(Object.keys(before.fields));
  const afterFields = new Set(Object.keys(after.fields));

  // Removed fields
  for (const fieldName of beforeFields) {
    if (!afterFields.has(fieldName)) {
      changes.push(
        Object.freeze({
          kind: "remove_field" as const,
          entity: entityName,
          field: fieldName,
        }),
      );
    }
  }

  // Added fields
  for (const fieldName of afterFields) {
    if (!beforeFields.has(fieldName)) {
      const field = after.fields[fieldName]!;
      changes.push(
        Object.freeze({
          kind: "add_field" as const,
          entity: entityName,
          field: fieldName,
          spec: fieldDefinitionToSpec(field),
        }),
      );
    }
  }

  // Altered fields
  for (const fieldName of beforeFields) {
    if (!afterFields.has(fieldName)) continue;

    const beforeField = before.fields[fieldName]!;
    const afterField = after.fields[fieldName]!;
    const alterations = diffField(beforeField, afterField);

    if (alterations) {
      changes.push(
        Object.freeze({
          kind: "alter_field" as const,
          entity: entityName,
          field: fieldName,
          changes: Object.freeze(alterations),
          currentKind: beforeField.kind,
          currentRole: beforeField.role,
        }),
      );
    }
  }

  return changes;
}

function diffField(
  before: FieldDefinition,
  after: FieldDefinition,
): FieldAlterations | null {
  const changes: Record<string, unknown> = {};

  if (before.kind !== after.kind) {
    changes["kind"] = { from: before.kind, to: after.kind };
  }

  if (before.nullable !== after.nullable) {
    changes["nullable"] = { from: before.nullable, to: after.nullable };
  }

  if (before.role !== after.role) {
    changes["role"] = { from: before.role, to: after.role };
  }

  if (before.description !== after.description) {
    changes["description"] = { from: before.description, to: after.description };
  }

  if (!policiesEqual(before.policy, after.policy)) {
    changes["policy"] = { from: before.policy, to: after.policy };
  }

  // Enum values diff
  if (before.kind === "enum" && after.kind === "enum") {
    const beforeValues = new Set((before as unknown as EnumLike).values);
    const afterValues = new Set((after as unknown as EnumLike).values);

    const added = [...afterValues].filter((v) => !beforeValues.has(v));
    const removed = [...beforeValues].filter((v) => !afterValues.has(v));

    if (added.length > 0 || removed.length > 0) {
      changes["values"] = { added, removed };
    }
  }

  // Ref entity/cascade diff
  if (before.kind === "ref" && after.kind === "ref") {
    const beforeRef = before as unknown as RefLike;
    const afterRef = after as unknown as RefLike;

    if (beforeRef.entity !== afterRef.entity) {
      changes["entity"] = { from: beforeRef.entity, to: afterRef.entity };
    }
    if (beforeRef.cascade !== afterRef.cascade) {
      changes["cascade"] = { from: beforeRef.cascade, to: afterRef.cascade };
    }
  }

  if (Object.keys(changes).length === 0) return null;
  return changes as FieldAlterations;
}

function diffInvariants(
  entityName: string,
  before: EntityDefinition,
  after: EntityDefinition,
): readonly SchemaChange[] {
  const changes: SchemaChange[] = [];
  const beforeSet = new Set(before.invariants);
  const afterSet = new Set(after.invariants);

  for (const inv of beforeSet) {
    if (!afterSet.has(inv)) {
      changes.push(
        Object.freeze({
          kind: "remove_invariant" as const,
          entity: entityName,
          invariant: inv,
        }),
      );
    }
  }

  for (const inv of afterSet) {
    if (!beforeSet.has(inv)) {
      changes.push(
        Object.freeze({
          kind: "add_invariant" as const,
          entity: entityName,
          invariant: inv,
        }),
      );
    }
  }

  return changes;
}

function policiesEqual(a: FieldPolicy, b: FieldPolicy): boolean {
  return (
    a.pii === b.pii &&
    a.retention === b.retention &&
    a.external_exposure === b.external_exposure &&
    a.access === b.access
  );
}
