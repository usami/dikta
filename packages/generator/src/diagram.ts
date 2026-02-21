import type { EntityRegistry, EntityDefinition, FieldDefinition, FieldKind } from "@dikta/core";
import type { RefFieldDefinition } from "@dikta/core";
import type { GeneratedFile } from "./types.js";
import { toSnakeCase } from "./file.js";

// ── Type Guards ────────────────────────────────────────────

function isRefField(field: FieldDefinition): field is RefFieldDefinition {
  return field.kind === "ref";
}

// ── Mermaid ER Attribute Type Mapping ──────────────────────

const FIELD_KIND_TO_MERMAID: Record<FieldKind, string> = {
  uuid: "uuid",
  string: "string",
  decimal: "decimal",
  integer: "integer",
  boolean: "boolean",
  timestamp: "timestamp",
  enum: "enum",
  ref: "uuid",
};

// ── Cardinality Mapping ────────────────────────────────────

/**
 * Maps a ref field to Mermaid ER relationship notation.
 *
 * Mermaid syntax: `Parent [left]--[right] Child`
 * - Left side = parent cardinality (from child's perspective)
 * - Right side = child cardinality (from parent's perspective)
 *
 * Notation values:
 * - `||` = exactly one
 * - `|o` = zero or one
 * - `o{` = zero or more
 * - `}|` = one or more
 *
 * Parent side: `||` if FK is non-nullable (child must reference parent),
 *              `|o` if FK is nullable (child may reference parent).
 * Child side: always `o{` (parent may have zero or more children).
 */
export function cascadeToRelationship(_cascade: string, nullable: boolean): string {
  const parentSide = nullable ? "|o" : "||";
  const childSide = "o{";

  return `${parentSide}--${childSide}`;
}

// ── Attribute Line Generation ──────────────────────────────

export function fieldToAttribute(name: string, field: FieldDefinition): string {
  const type = FIELD_KIND_TO_MERMAID[field.kind];
  const constraints: string[] = [];

  if (field.role === "identifier") {
    constraints.push("PK");
  }
  if (isRefField(field)) {
    constraints.push("FK");
  }

  const constraintStr = constraints.length > 0 ? ` ${constraints.join(",")}` : "";
  const comment = field.description
    ? ` "${field.description}"`
    : "";

  return `    ${type} ${toSnakeCase(name)}${constraintStr}${comment}`;
}

// ── Entity Block Generation ────────────────────────────────

export function entityToBlock(entity: EntityDefinition): string {
  const lines: string[] = [];
  lines.push(`  ${entity.name} {`);

  for (const [fieldName, field] of Object.entries(entity.fields)) {
    lines.push(fieldToAttribute(fieldName, field));
  }

  lines.push("  }");
  return lines.join("\n");
}

// ── Relationship Line Generation ───────────────────────────

export function relationshipToLine(
  from: string,
  to: string,
  relationship: string,
  label: string,
): string {
  return `  ${to} ${relationship} ${from} : "${label}"`;
}

// ── Full ER Diagram Generation ─────────────────────────────

export function generateERDiagram(schema: EntityRegistry): string {
  const entities = schema.list();
  if (entities.length === 0) return "";

  const lines: string[] = [];
  lines.push("erDiagram");

  // Entity blocks
  for (const entity of entities) {
    lines.push(entityToBlock(entity));
  }

  // Relationship lines
  const relationships = schema.getRelationships();
  for (const rel of relationships) {
    const fromEntity = schema.get(rel.from);
    const field = fromEntity.fields[rel.fromField];
    const nullable = field?.nullable ?? false;
    const notation = cascadeToRelationship(rel.cascade, nullable);
    const label = toSnakeCase(rel.fromField);

    lines.push(relationshipToLine(rel.from, rel.to, notation, label));
  }

  return lines.join("\n") + "\n";
}

// ── GeneratedFile Entry Point ──────────────────────────────

export function generateERDiagramFile(schema: EntityRegistry): readonly GeneratedFile[] {
  const content = generateERDiagram(schema);
  if (!content) return [];

  return [
    {
      path: "diagram/er.mmd",
      content,
      purpose: "Mermaid ER diagram of entity relationships",
      regeneratable: true,
    },
  ];
}
