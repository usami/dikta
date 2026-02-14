import type { EntityDefinition } from "./entity.js";
import type { FieldDefinition, FieldKind } from "./fields/types.js";
import type { EnumFieldDefinition } from "./fields/enum.js";
import type { RefFieldDefinition, CascadeRule } from "./fields/ref.js";
import { uuid, string, decimal, integer, boolean, timestamp } from "./fields/primitives.js";
import { enumField } from "./fields/enum.js";
import { ref } from "./fields/ref.js";
import { defineEntity } from "./entity.js";
import { createRegistry, type EntityRegistry } from "./registry.js";

const SERIALIZATION_VERSION = 1;

interface SerializedField {
  kind: FieldKind;
  nullable: boolean;
  role: string;
  description: string;
  policy: Record<string, unknown>;
  values?: readonly string[];
  entity?: string;
  cascade?: string;
}

interface SerializedEntity {
  name: string;
  fields: Record<string, SerializedField>;
  invariants: readonly string[];
  query_hints: Record<string, unknown>;
}

interface SerializedRegistry {
  version: number;
  entities: SerializedEntity[];
}

function serializeField(field: FieldDefinition): SerializedField {
  const base: SerializedField = {
    kind: field.kind,
    nullable: field.nullable,
    role: field.role,
    description: field.description,
    policy: { ...field.policy },
  };

  if (field.kind === "enum") {
    const enumF = field as unknown as EnumFieldDefinition<readonly string[]>;
    base.values = [...enumF.values];
  }

  if (field.kind === "ref") {
    const refF = field as unknown as RefFieldDefinition;
    base.entity = refF.entity;
    base.cascade = refF.cascade;
  }

  return base;
}

export function serializeRegistry(entities: readonly EntityDefinition[]): string {
  const serialized: SerializedRegistry = {
    version: SERIALIZATION_VERSION,
    entities: entities.map((entity) => ({
      name: entity.name,
      fields: Object.fromEntries(
        Object.entries(entity.fields).map(([name, field]) => [
          name,
          serializeField(field),
        ]),
      ),
      invariants: [...entity.invariants],
      query_hints: { ...entity.query_hints },
    })),
  };

  return JSON.stringify(serialized, null, 2);
}

const PRIMITIVE_BUILDERS: Record<
  string,
  (opts: Record<string, unknown>) => FieldDefinition
> = {
  uuid: (opts) => uuid(opts),
  string: (opts) => string(opts),
  decimal: (opts) => decimal(opts),
  integer: (opts) => integer(opts),
  boolean: (opts) => boolean(opts),
  timestamp: (opts) => timestamp(opts),
};

function deserializeField(serialized: SerializedField): FieldDefinition {
  const opts = {
    nullable: serialized.nullable,
    role: serialized.role as FieldDefinition["role"],
    description: serialized.description,
    ...serialized.policy,
  };

  if (serialized.kind === "enum" && serialized.values) {
    return enumField([...serialized.values], opts);
  }

  if (serialized.kind === "ref" && serialized.entity) {
    return ref(serialized.entity, {
      ...opts,
      cascade: serialized.cascade as CascadeRule,
    });
  }

  const builder = PRIMITIVE_BUILDERS[serialized.kind];
  if (!builder) {
    throw new Error(`Unknown field kind: "${serialized.kind}"`);
  }
  return builder(opts);
}

export function deserializeRegistry(json: string): EntityRegistry {
  const parsed: SerializedRegistry = JSON.parse(json);

  if (parsed.version !== SERIALIZATION_VERSION) {
    throw new Error(
      `Unsupported serialization version: ${String(parsed.version)}. Expected: ${String(SERIALIZATION_VERSION)}`,
    );
  }

  const entities = parsed.entities.map((serializedEntity) => {
    const fields: Record<string, FieldDefinition> = {};
    for (const [name, serializedField] of Object.entries(serializedEntity.fields)) {
      fields[name] = deserializeField(serializedField);
    }

    return defineEntity({
      name: serializedEntity.name,
      fields,
      invariants: serializedEntity.invariants,
      query_hints: serializedEntity.query_hints,
    });
  });

  return createRegistry(entities);
}
