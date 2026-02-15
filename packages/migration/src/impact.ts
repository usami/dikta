import type { QueryRegistry, EntityRegistry, JoinShapeField, ShapeField } from "@dikta/core";
import type {
  SchemaChange,
  MigrationImpact,
  ContractImpact,
  ImpactSeverity,
  IndexRecommendation,
  BackfillRequirement,
} from "./types.js";

export function analyzeImpact(
  changes: readonly SchemaChange[],
  queries: QueryRegistry,
  schema: EntityRegistry,
): MigrationImpact {
  const contracts: ContractImpact[] = [];
  const indexRecommendations: IndexRecommendation[] = [];
  const backfillRequirements: BackfillRequirement[] = [];

  // Build lookup maps for what changed
  const removedEntities = new Set<string>();
  const removedFields = new Map<string, Set<string>>();
  const renamedEntities = new Map<string, string>();
  const renamedFields = new Map<string, Map<string, string>>();
  const alteredFields = new Map<string, Set<string>>();
  const addedFields = new Map<string, Set<string>>();
  const metadataOnlyChanges = new Set<string>();

  for (const change of changes) {
    switch (change.kind) {
      case "remove_entity":
        removedEntities.add(change.entity);
        break;
      case "rename_entity":
        renamedEntities.set(change.from, change.to);
        break;
      case "remove_field": {
        const set = removedFields.get(change.entity) ?? new Set();
        set.add(change.field);
        removedFields.set(change.entity, set);
        break;
      }
      case "rename_field": {
        const map = renamedFields.get(change.entity) ?? new Map();
        map.set(change.from, change.to);
        renamedFields.set(change.entity, map);
        break;
      }
      case "alter_field": {
        const set = alteredFields.get(change.entity) ?? new Set();
        set.add(change.field);
        alteredFields.set(change.entity, set);
        break;
      }
      case "add_field": {
        const set = addedFields.get(change.entity) ?? new Set();
        set.add(change.field);
        addedFields.set(change.entity, set);

        // Check for backfill requirement
        if (change.spec.nullable !== true && !change.backfill) {
          backfillRequirements.push({
            entity: change.entity,
            field: change.field,
            reason: `Non-nullable field "${change.field}" added without backfill expression`,
          });
        }

        // Index recommendation for ref fields
        if (change.spec.kind === "ref") {
          indexRecommendations.push({
            action: "add",
            entity: change.entity,
            field: change.field,
            reason: `New foreign key "${change.field}" references "${change.spec.entity}"`,
          });
        }
        break;
      }
      case "add_invariant":
      case "remove_invariant":
        metadataOnlyChanges.add(`${change.entity}:invariant`);
        break;
    }
  }

  // Index recommendations for removed ref fields
  for (const change of changes) {
    if (change.kind === "remove_field") {
      // Check if the removed field was a ref
      try {
        const entity = schema.list().find((e) => e.name === change.entity);
        if (entity && entity.fields[change.field]?.kind === "ref") {
          indexRecommendations.push({
            action: "remove",
            entity: change.entity,
            field: change.field,
            reason: `Foreign key field "${change.field}" removed`,
          });
        }
      } catch {
        // Entity may not exist in new schema
      }
    }
  }

  // Analyze impact on each query contract
  for (const query of queries.list()) {
    const reasons: string[] = [];
    let severity: ImpactSeverity = "informational";

    const { config } = query;

    // Check if base entity is affected
    if (removedEntities.has(config.from)) {
      reasons.push(`Base entity "${config.from}" has been removed`);
      severity = "breaking";
    } else if (renamedEntities.has(config.from)) {
      reasons.push(`Base entity "${config.from}" renamed to "${renamedEntities.get(config.from)}"`);
      severity = "breaking";
    }

    // Check shape fields
    for (const [fieldName, shapeField] of Object.entries(config.returns.shape)) {
      if (isJoinShapeField(shapeField)) {
        // JOIN field: check "Entity.field"
        const [targetEntity, targetField] = shapeField.from.split(".") as [string, string];

        if (removedEntities.has(targetEntity)) {
          reasons.push(`JOIN target entity "${targetEntity}" removed (field: ${fieldName})`);
          severity = "breaking";
        } else if (renamedEntities.has(targetEntity)) {
          reasons.push(`JOIN target entity "${targetEntity}" renamed (field: ${fieldName})`);
          severity = "breaking";
        } else if (removedFields.get(targetEntity)?.has(targetField)) {
          reasons.push(`JOIN target field "${shapeField.from}" removed (field: ${fieldName})`);
          severity = "breaking";
        } else if (renamedFields.get(targetEntity)?.has(targetField)) {
          reasons.push(`JOIN target field "${shapeField.from}" renamed (field: ${fieldName})`);
          severity = "breaking";
        } else if (alteredFields.get(targetEntity)?.has(targetField)) {
          reasons.push(`JOIN target field "${shapeField.from}" altered (field: ${fieldName})`);
          severity = maxSeverity(severity, "compatible");
        }
      } else {
        // Direct field on base entity
        if (removedFields.get(config.from)?.has(fieldName)) {
          reasons.push(`Shape field "${fieldName}" removed from "${config.from}"`);
          severity = "breaking";
        } else if (renamedFields.get(config.from)?.has(fieldName)) {
          reasons.push(`Shape field "${fieldName}" renamed on "${config.from}"`);
          severity = "breaking";
        } else if (alteredFields.get(config.from)?.has(fieldName)) {
          const alterChange = changes.find(
            (c) =>
              c.kind === "alter_field" &&
              c.entity === config.from &&
              c.field === fieldName,
          );
          if (alterChange && alterChange.kind === "alter_field") {
            if (alterChange.changes.kind) {
              reasons.push(`Shape field "${fieldName}" type changed`);
              severity = "breaking";
            } else if (alterChange.changes.nullable?.to === false) {
              reasons.push(`Shape field "${fieldName}" made non-nullable`);
              severity = "breaking";
            } else {
              reasons.push(`Shape field "${fieldName}" altered on "${config.from}"`);
              severity = maxSeverity(severity, "compatible");
            }
          }
        }
      }
    }

    // Check security references
    if (config.security?.row_filter) {
      const filterField = config.security.row_filter;
      if (removedFields.get(config.from)?.has(filterField)) {
        reasons.push(`Row filter field "${filterField}" removed`);
        severity = "breaking";
      } else if (renamedFields.get(config.from)?.has(filterField)) {
        reasons.push(`Row filter field "${filterField}" renamed`);
        severity = "breaking";
      }
    }

    if (config.security?.pii_fields) {
      for (const piiField of config.security.pii_fields) {
        if (removedFields.get(config.from)?.has(piiField)) {
          reasons.push(`PII field "${piiField}" removed`);
          severity = maxSeverity(severity, "compatible");
        }
      }
    }

    // Check params that might reference entity fields
    // (params themselves are abstract, but we can check if the base entity lost fields used in params)

    // Check for metadata-only changes that affect this entity
    if (reasons.length === 0 && metadataOnlyChanges.has(`${config.from}:invariant`)) {
      reasons.push(`Invariants changed on base entity "${config.from}"`);
      severity = "informational";
    }

    // Check for added nullable fields (compatible change)
    if (reasons.length === 0 && addedFields.has(config.from)) {
      const added = addedFields.get(config.from)!;
      for (const addedField of added) {
        const addChange = changes.find(
          (c) =>
            c.kind === "add_field" &&
            c.entity === config.from &&
            c.field === addedField,
        );
        if (addChange && addChange.kind === "add_field" && addChange.spec.nullable) {
          reasons.push(`Nullable field "${addedField}" added to "${config.from}"`);
          severity = maxSeverity(severity, "compatible");
        }
      }
    }

    if (reasons.length > 0) {
      contracts.push(
        Object.freeze({
          query: query.name,
          severity,
          reasons: Object.freeze(reasons),
        }),
      );
    }
  }

  return Object.freeze({
    contracts: Object.freeze(contracts),
    indexRecommendations: Object.freeze(indexRecommendations),
    backfillRequirements: Object.freeze(backfillRequirements),
  });
}

// ── Helpers ─────────────────────────────────────────────────

function isJoinShapeField(field: ShapeField): field is JoinShapeField {
  return typeof field === "object" && "from" in field;
}

const SEVERITY_ORDER: Record<ImpactSeverity, number> = {
  informational: 0,
  compatible: 1,
  breaking: 2,
};

function maxSeverity(a: ImpactSeverity, b: ImpactSeverity): ImpactSeverity {
  return SEVERITY_ORDER[a] >= SEVERITY_ORDER[b] ? a : b;
}
