import type { EntityDefinition, EntityRegistry, FieldDefinition, FieldKind } from "@dikta/core";
import type { GeneratedFile } from "../types.js";
import { toPascalCase } from "../file.js";

// ── FieldKind → JSON Schema type/format mapping ─────────

const FIELD_KIND_TO_JSON_SCHEMA: Record<FieldKind, { readonly type: string; readonly format?: string }> = {
  uuid: { type: "string", format: "uuid" },
  string: { type: "string" },
  decimal: { type: "number" },
  integer: { type: "integer" },
  boolean: { type: "boolean" },
  timestamp: { type: "string", format: "date-time" },
  enum: { type: "string" }, // fallback; overridden for EnumFieldDefinition
  ref: { type: "string" }, // fallback; overridden for RefFieldDefinition
};

function isEnumField(field: FieldDefinition): field is FieldDefinition & { readonly values: readonly string[] } {
  return field.kind === "enum" && "values" in field;
}

function isRefField(field: FieldDefinition): field is FieldDefinition & { readonly entity: string } {
  return field.kind === "ref" && "entity" in field;
}

/**
 * Map a single FieldDefinition to an OpenAPI 3.1 JSON Schema property.
 *
 * - Simple types use `type` + optional `format`
 * - Enum fields use `type: "string"` + `enum: [...]`
 * - Ref fields use `$ref: "#/components/schemas/{Entity}"`
 * - Nullable simple types use `type: ["<base>", "null"]`
 * - Nullable $ref / enum use `anyOf: [<schema>, { type: "null" }]`
 */
export function fieldToJsonSchema(field: FieldDefinition): Record<string, unknown> {
  let schema: Record<string, unknown>;

  if (isRefField(field)) {
    schema = { $ref: `#/components/schemas/${toPascalCase(field.entity)}` };
  } else if (isEnumField(field)) {
    schema = { type: "string", enum: [...field.values] };
  } else {
    const base = FIELD_KIND_TO_JSON_SCHEMA[field.kind];
    schema = base.format ? { type: base.type, format: base.format } : { type: base.type };
  }

  if (field.description) {
    schema = { ...schema, description: field.description };
  }

  if (!field.nullable) return schema;

  // Nullable: $ref and enum need anyOf wrapping
  if ("$ref" in schema || "enum" in schema) {
    const { description, ...rest } = schema;
    const result: Record<string, unknown> = { anyOf: [rest, { type: "null" }] };
    if (description) result.description = description;
    return result;
  }

  // Simple types: convert type to array
  return { ...schema, type: [schema.type as string, "null"] };
}

// ── Per-entity schema object ─────────────────────────────

/**
 * Convert an EntityDefinition to an OpenAPI 3.1 Schema Object.
 * All defined fields are listed as `required` (nullable fields allow null values via type).
 */
export function entityToJsonSchema(entity: EntityDefinition): Record<string, unknown> {
  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];

  for (const [fieldName, field] of Object.entries(entity.fields)) {
    properties[fieldName] = fieldToJsonSchema(field);
    required.push(fieldName);
  }

  return {
    type: "object",
    properties,
    required,
  };
}

// ── Public entry point ───────────────────────────────────

/**
 * Generate OpenAPI 3.1 component schemas for all entities in the registry.
 * Output is a single JSON file representing the `components.schemas` section.
 */
export function generateOpenAPISchemas(schema: EntityRegistry): readonly GeneratedFile[] {
  const entities = schema.list();
  if (entities.length === 0) return [];

  const schemas: Record<string, Record<string, unknown>> = {};

  for (const entity of entities) {
    schemas[toPascalCase(entity.name)] = entityToJsonSchema(entity);
  }

  const content = JSON.stringify(schemas, null, 2) + "\n";

  return [
    {
      path: "openapi/schemas.json",
      content,
      purpose: "OpenAPI 3.1 component schemas for all entities",
      regeneratable: true,
    },
  ];
}
