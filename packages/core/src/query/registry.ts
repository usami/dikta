import type { EntityRegistry } from "../registry.js";
import type { RefFieldDefinition } from "../fields/ref.js";
import type { QueryContract, JoinShapeField, ShapeField } from "./types.js";

export interface ValidationError {
  readonly query: string;
  readonly field?: string;
  readonly message: string;
}

export interface PerformanceConflict {
  readonly queries: readonly string[];
  readonly field: string;
  readonly message: string;
}

export interface QueryRegistry {
  get(name: string): QueryContract;
  list(): readonly QueryContract[];
  validate(): readonly ValidationError[];
  detectPerformanceConflicts(): readonly PerformanceConflict[];
}

function isJoinShapeField(field: ShapeField): field is JoinShapeField {
  return typeof field === "object" && "from" in field;
}

export function createQueryRegistry(
  contracts: readonly QueryContract[],
  entityRegistry: EntityRegistry,
): QueryRegistry {
  const map = new Map<string, QueryContract>();

  for (const contract of contracts) {
    if (map.has(contract.name)) {
      throw new Error(`Duplicate query contract name: "${contract.name}"`);
    }
    map.set(contract.name, contract);
  }

  return Object.freeze({
    get(name: string): QueryContract {
      const contract = map.get(name);
      if (!contract) {
        const available = [...map.keys()].join(", ");
        throw new Error(
          `Query contract "${name}" not found. Available contracts: ${available}`,
        );
      }
      return contract;
    },

    list(): readonly QueryContract[] {
      return [...map.values()];
    },

    validate(): readonly ValidationError[] {
      const errors: ValidationError[] = [];

      for (const contract of map.values()) {
        const { name, config } = contract;

        // Check: from entity exists
        let fromEntity;
        try {
          fromEntity = entityRegistry.get(config.from);
        } catch {
          errors.push({
            query: name,
            message: `Entity "${config.from}" referenced in "from" does not exist`,
          });
          continue;
        }

        const shape = config.returns.shape;
        let joinCount = 0;

        for (const [fieldName, shapeField] of Object.entries(shape)) {
          if (isJoinShapeField(shapeField)) {
            // JOIN field: check "entity.field" reference
            joinCount++;
            const parts = shapeField.from.split(".");
            if (parts.length !== 2) {
              errors.push({
                query: name,
                field: fieldName,
                message: `JOIN field "from" must be "entity.field" format, got "${shapeField.from}"`,
              });
              continue;
            }

            const [targetEntityName, targetFieldName] = parts as [string, string];

            // Check target entity exists
            let targetEntity;
            try {
              targetEntity = entityRegistry.get(targetEntityName);
            } catch {
              errors.push({
                query: name,
                field: fieldName,
                message: `JOIN target entity "${targetEntityName}" does not exist`,
              });
              continue;
            }

            // Check target field exists
            if (!(targetFieldName in targetEntity.fields)) {
              errors.push({
                query: name,
                field: fieldName,
                message: `Field "${targetFieldName}" does not exist on entity "${targetEntityName}"`,
              });
              continue;
            }

            // Check relationship path: from entity must have a ref to target entity
            const relationships = entityRegistry.getRelationships();
            const hasPath = relationships.some(
              (r) =>
                (r.from === config.from && r.to === targetEntityName) ||
                (r.from === targetEntityName && r.to === config.from),
            );
            if (!hasPath) {
              // Also check if the from entity has a direct ref field pointing to target
              const fromFields = Object.values(fromEntity.fields);
              const hasDirectRef = fromFields.some(
                (f) => f.kind === "ref" && (f as unknown as RefFieldDefinition).entity === targetEntityName,
              );
              if (!hasDirectRef && !hasPath) {
                errors.push({
                  query: name,
                  field: fieldName,
                  message: `No relationship path between "${config.from}" and "${targetEntityName}"`,
                });
              }
            }
          } else {
            // Direct shape field: check it exists on the from entity
            if (!(fieldName in fromEntity.fields)) {
              errors.push({
                query: name,
                field: fieldName,
                message: `Field "${fieldName}" does not exist on entity "${config.from}"`,
              });
            }
          }
        }

        // Check ordering fields exist in shape
        if (config.returns.ordering) {
          for (const order of config.returns.ordering) {
            if (!(order.field in shape)) {
              errors.push({
                query: name,
                field: order.field,
                message: `Ordering field "${order.field}" is not in the query shape`,
              });
            }
          }
        }

        // Check max_joins consistency
        const maxJoins = config.performance?.max_joins;
        if (maxJoins !== undefined && joinCount > maxJoins) {
          errors.push({
            query: name,
            message: `Query has ${joinCount} JOIN field(s) but max_joins is ${maxJoins}`,
          });
        }
      }

      return errors;
    },

    detectPerformanceConflicts(): readonly PerformanceConflict[] {
      const conflicts: PerformanceConflict[] = [];

      // Group queries by their from entity
      const byEntity = new Map<string, QueryContract[]>();
      for (const contract of map.values()) {
        const existing = byEntity.get(contract.config.from) ?? [];
        existing.push(contract);
        byEntity.set(contract.config.from, existing);
      }

      // Check for conflicting scan strategies on the same entity
      for (const [entity, queries] of byEntity) {
        const strategies = new Map<string, string[]>();
        for (const q of queries) {
          const strategy = q.config.performance?.scan_strategy;
          if (strategy) {
            const existing = strategies.get(strategy) ?? [];
            existing.push(q.name);
            strategies.set(strategy, existing);
          }
        }

        if (strategies.size > 1) {
          const allNames = [...strategies.values()].flat();
          const strategyList = [...strategies.keys()].join(" vs ");
          conflicts.push({
            queries: allNames,
            field: entity,
            message: `Conflicting scan strategies on entity "${entity}": ${strategyList}`,
          });
        }
      }

      return conflicts;
    },
  });
}
