import type { EntityDefinition, EntityRegistry, FieldDefinition, FieldKind } from "@dikta/core";
import type { GeneratedFile } from "./types.js";
import { fileHeader, toSnakeCase, toPascalCase } from "./file.js";

// ── FieldKind → Zod mapping ────────────────────────────────

const FIELD_KIND_TO_ZOD: Record<FieldKind, string> = {
  uuid: "z.string().uuid()",
  string: "z.string()",
  decimal: "z.number()",
  integer: "z.number().int()",
  boolean: "z.boolean()",
  timestamp: "z.coerce.date()",
  enum: "z.string()", // fallback; overridden for EnumFieldDefinition
  ref: "z.string().uuid()",
};

function isEnumField(field: FieldDefinition): field is FieldDefinition & { readonly values: readonly string[] } {
  return field.kind === "enum" && "values" in field;
}

/**
 * Map a single FieldDefinition to its Zod method chain string.
 */
export function fieldKindToZod(field: FieldDefinition): string {
  let base: string;

  if (isEnumField(field)) {
    const literals = field.values.map((v) => `"${v}"`).join(", ");
    base = `z.enum([${literals}])`;
  } else {
    base = FIELD_KIND_TO_ZOD[field.kind];
  }

  return field.nullable ? `${base}.nullable()` : base;
}

// ── Per-entity schema generation ────────────────────────────

export function generateEntitySchema(entity: EntityDefinition): GeneratedFile {
  const pascal = toPascalCase(entity.name);
  const snake = toSnakeCase(entity.name);

  const fieldLines = Object.entries(entity.fields).map(
    ([name, field]) => `  ${name}: ${fieldKindToZod(field)},`,
  );

  const content = [
    fileHeader(),
    `import { z } from "zod";`,
    "",
    `export const ${pascal}Schema = z.object({`,
    ...fieldLines,
    `});`,
    "",
    `export type ${pascal} = z.infer<typeof ${pascal}Schema>;`,
    "",
    `export const parse${pascal} = ${pascal}Schema.parse.bind(${pascal}Schema);`,
    `export const safeParse${pascal} = ${pascal}Schema.safeParse.bind(${pascal}Schema);`,
    "",
  ].join("\n");

  return {
    path: `schemas/${snake}.schema.ts`,
    content,
    purpose: `Zod validation schema for ${entity.name}`,
    regeneratable: true,
  };
}

// ── Barrel index generation ─────────────────────────────────

function generateSchemaIndex(entities: readonly EntityDefinition[]): GeneratedFile {
  const lines = entities.map((entity) => {
    const snake = toSnakeCase(entity.name);
    return `export * from "./${snake}.schema.js";`;
  });

  const content = [fileHeader(), ...lines, ""].join("\n");

  return {
    path: "schemas/index.ts",
    content,
    purpose: "Barrel re-export for all Zod schemas",
    regeneratable: true,
  };
}

// ── Public entry point ──────────────────────────────────────

export function generateSchemas(schema: EntityRegistry): readonly GeneratedFile[] {
  const entities = schema.list();
  if (entities.length === 0) return [];

  const schemaFiles = entities.map(generateEntitySchema);
  const index = generateSchemaIndex(entities);

  return [...schemaFiles, index];
}
