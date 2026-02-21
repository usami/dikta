import type { EntityDefinition, EntityRegistry, FieldDefinition, FieldKind } from "@dikta/core";
import type { GeneratedFile } from "../types.js";
import { toPascalCase } from "../file.js";

// ── FieldKind → GraphQL scalar mapping ──────────────────

const FIELD_KIND_TO_GRAPHQL: Record<FieldKind, string> = {
  uuid: "ID",
  string: "String",
  decimal: "Float",
  integer: "Int",
  boolean: "Boolean",
  timestamp: "DateTime",
  enum: "String", // fallback; overridden for EnumFieldDefinition
  ref: "String", // fallback; overridden for RefFieldDefinition
};

function isEnumField(field: FieldDefinition): field is FieldDefinition & { readonly values: readonly string[] } {
  return field.kind === "enum" && "values" in field;
}

function isRefField(field: FieldDefinition): field is FieldDefinition & { readonly entity: string } {
  return field.kind === "ref" && "entity" in field;
}

// ── Enum value formatting ───────────────────────────────

/**
 * Convert an enum value to GraphQL UPPER_SNAKE_CASE convention.
 * GraphQL enum values must be `[_A-Za-z][_0-9A-Za-z]+`.
 */
export function toGraphQLEnumValue(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .toUpperCase();
}

// ── Per-field GraphQL type ──────────────────────────────

/**
 * Map a single FieldDefinition to its GraphQL type string.
 *
 * - Simple types use the scalar mapping (e.g. `String`, `Int`)
 * - Enum fields use a PascalCase enum type name derived from the entity context
 * - Ref fields use the referenced entity's PascalCase type name
 * - Non-nullable fields append `!` (GraphQL default is nullable)
 */
export function fieldToGraphQLType(field: FieldDefinition, enumTypeName?: string): string {
  let baseType: string;

  if (isRefField(field)) {
    baseType = toPascalCase(field.entity);
  } else if (isEnumField(field) && enumTypeName) {
    baseType = enumTypeName;
  } else {
    baseType = FIELD_KIND_TO_GRAPHQL[field.kind];
  }

  return field.nullable ? baseType : `${baseType}!`;
}

// ── Enum type collection ────────────────────────────────

export interface GraphQLEnumType {
  readonly name: string;
  readonly values: readonly string[];
  readonly description?: string;
}

/**
 * Collect all unique enum types across entities.
 *
 * Naming convention: `{EntityName}{FieldName}` in PascalCase.
 * Example: entity "order", field "status" → `OrderStatus`.
 */
export function collectEnumTypes(entities: readonly EntityDefinition[]): readonly GraphQLEnumType[] {
  const enums: GraphQLEnumType[] = [];

  for (const entity of entities) {
    for (const [fieldName, field] of Object.entries(entity.fields)) {
      if (isEnumField(field)) {
        enums.push({
          name: `${toPascalCase(entity.name)}${toPascalCase(fieldName)}`,
          values: field.values,
          ...(field.description ? { description: field.description } : {}),
        });
      }
    }
  }

  return enums;
}

// ── Per-entity GraphQL Object Type ──────────────────────

/**
 * Convert an EntityDefinition to a GraphQL Object Type SDL block.
 *
 * Produces output like:
 * ```graphql
 * type User {
 *   id: ID!
 *   name: String!
 *   email: String
 * }
 * ```
 */
export function entityToGraphQLType(entity: EntityDefinition): string {
  const typeName = toPascalCase(entity.name);
  const lines: string[] = [];

  for (const [fieldName, field] of Object.entries(entity.fields)) {
    const enumTypeName = isEnumField(field)
      ? `${typeName}${toPascalCase(fieldName)}`
      : undefined;
    const graphqlType = fieldToGraphQLType(field, enumTypeName);
    const desc = field.description ? `  """${field.description}"""\n` : "";
    lines.push(`${desc}  ${fieldName}: ${graphqlType}`);
  }

  return `type ${typeName} {\n${lines.join("\n")}\n}`;
}

// ── SDL Assembly ────────────────────────────────────────

/**
 * Generate a complete GraphQL SDL string from an entity registry.
 *
 * Output order:
 * 1. Custom scalar declarations (DateTime if any timestamp fields exist)
 * 2. Enum type definitions
 * 3. Object type definitions (one per entity)
 */
export function generateGraphQLSchema(schema: EntityRegistry): string {
  const entities = schema.list();
  if (entities.length === 0) return "";

  const sections: string[] = [];

  // 1. Check if DateTime scalar is needed
  const needsDateTime = entities.some((entity) =>
    Object.values(entity.fields).some((f) => f.kind === "timestamp"),
  );
  if (needsDateTime) {
    sections.push("scalar DateTime");
  }

  // 2. Enum types
  const enums = collectEnumTypes(entities);
  for (const enumType of enums) {
    const values = enumType.values
      .map((v) => `  ${toGraphQLEnumValue(v)}`)
      .join("\n");
    const desc = enumType.description ? `"""${enumType.description}"""\n` : "";
    sections.push(`${desc}enum ${enumType.name} {\n${values}\n}`);
  }

  // 3. Object types
  for (const entity of entities) {
    sections.push(entityToGraphQLType(entity));
  }

  return sections.join("\n\n") + "\n";
}

// ── Public entry point ──────────────────────────────────

/**
 * Generate GraphQL SDL type definitions for all entities in the registry.
 * Output is a single `.graphql` file containing scalar declarations,
 * enum types, and object types.
 */
export function generateGraphQLTypes(schema: EntityRegistry): readonly GeneratedFile[] {
  const entities = schema.list();
  if (entities.length === 0) return [];

  const content = generateGraphQLSchema(schema);

  return [
    {
      path: "graphql/schema.graphql",
      content,
      purpose: "GraphQL SDL type definitions for all entities",
      regeneratable: true,
    },
  ];
}
