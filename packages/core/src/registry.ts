import type { EntityDefinition } from "./entity.js";
import type { FieldPolicy } from "./policy.js";
import type { RefFieldDefinition } from "./fields/ref.js";
import { serializeRegistry } from "./serialize.js";

export interface Relationship {
  readonly from: string;
  readonly fromField: string;
  readonly to: string;
  readonly cascade: string;
}

export interface EntityRegistry {
  get(name: string): EntityDefinition;
  list(): readonly EntityDefinition[];
  findFieldsWithPolicy(
    key: keyof FieldPolicy,
    value: FieldPolicy[keyof FieldPolicy],
  ): readonly { entity: string; field: string; policy: FieldPolicy }[];
  getRelationships(): readonly Relationship[];
  serialize(): string;
}

export function createRegistry(
  entities: readonly EntityDefinition[],
): EntityRegistry {
  const map = new Map<string, EntityDefinition>();

  for (const entity of entities) {
    if (map.has(entity.name)) {
      throw new Error(`Duplicate entity name: "${entity.name}"`);
    }
    map.set(entity.name, entity);
  }

  return Object.freeze({
    get(name: string): EntityDefinition {
      const entity = map.get(name);
      if (!entity) {
        const available = [...map.keys()].join(", ");
        throw new Error(
          `Entity "${name}" not found. Available entities: ${available}`,
        );
      }
      return entity;
    },

    list(): readonly EntityDefinition[] {
      return [...map.values()];
    },

    findFieldsWithPolicy(
      key: keyof FieldPolicy,
      value: FieldPolicy[keyof FieldPolicy],
    ): readonly { entity: string; field: string; policy: FieldPolicy }[] {
      const results: { entity: string; field: string; policy: FieldPolicy }[] = [];
      for (const entity of map.values()) {
        for (const [fieldName, field] of Object.entries(entity.fields)) {
          if (field.policy[key] === value) {
            results.push({
              entity: entity.name,
              field: fieldName,
              policy: field.policy,
            });
          }
        }
      }
      return results;
    },

    getRelationships(): readonly Relationship[] {
      const relationships: Relationship[] = [];
      for (const entity of map.values()) {
        for (const [fieldName, field] of Object.entries(entity.fields)) {
          if (field.kind === "ref") {
            const refField = field as unknown as RefFieldDefinition;
            relationships.push({
              from: entity.name,
              fromField: fieldName,
              to: refField.entity,
              cascade: refField.cascade,
            });
          }
        }
      }
      return relationships;
    },

    serialize(): string {
      return serializeRegistry([...map.values()]);
    },
  });
}
