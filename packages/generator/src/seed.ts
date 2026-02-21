import type { EntityRegistry, EntityDefinition, FieldDefinition, FieldKind, FieldRole } from "@dikta/core";
import type { RefFieldDefinition, EnumFieldDefinition } from "@dikta/core";
import type { GeneratedFile } from "./types.js";
import { fileHeader, toCamelCase } from "./file.js";
import { topologicalSort } from "./targets/postgresql/topo-sort.js";

// ── Type Guards ────────────────────────────────────────────

function isRefField(field: FieldDefinition): field is RefFieldDefinition {
  return field.kind === "ref";
}

function isEnumField(field: FieldDefinition): field is EnumFieldDefinition<readonly string[]> {
  return field.kind === "enum";
}

// ── Configuration ──────────────────────────────────────────

export interface SeedConfig {
  readonly defaultCount?: number;
  readonly counts?: Record<string, number>;
  readonly seed?: number;
}

const DEFAULT_SEED_CONFIG = {
  defaultCount: 10,
  seed: 42,
} as const;

// ── FieldRole → faker Mapping ──────────────────────────────

/**
 * Maps a FieldRole to a faker expression string.
 * Returns null when the role does not have a specific mapping,
 * signalling the caller to fall through to FieldKind-based mapping.
 */
export function fieldRoleToFaker(role: FieldRole, kind: FieldKind): string | null {
  switch (role) {
    case "identifier":
      return kind === "uuid" ? "faker.string.uuid()" : null;
    case "monetary":
      return "Number(faker.finance.amount())";
    case "audit_timestamp":
      return "faker.date.recent().toISOString()";
    case "display_name":
      return "faker.person.fullName()";
    case "description":
      return "faker.lorem.sentence()";
    case "status":
      return null; // handled by enum logic
    case "quantity":
      return "faker.number.int({ min: 1, max: 100 })";
    case "reference":
      return null; // handled by ref logic
    case "general":
      return null; // fall through to kind mapping
  }
}

// ── FieldKind → faker Mapping ──────────────────────────────

/**
 * Fallback mapping from FieldKind to faker expression.
 * Used when fieldRoleToFaker returns null.
 */
export function fieldKindToFaker(kind: FieldKind): string {
  switch (kind) {
    case "uuid":
      return "faker.string.uuid()";
    case "string":
      return "faker.lorem.word()";
    case "decimal":
      return "Number(faker.finance.amount())";
    case "integer":
      return "faker.number.int({ min: 0, max: 1000 })";
    case "boolean":
      return "faker.datatype.boolean()";
    case "timestamp":
      return "faker.date.recent().toISOString()";
    case "enum":
      return "faker.lorem.word()"; // unreachable: enum handled in fieldToFakerExpression
    case "ref":
      return "faker.string.uuid()"; // unreachable: ref handled in fieldToFakerExpression
  }
}

// ── Field → faker Expression ───────────────────────────────

type EntitySeedInfo = {
  readonly varName: string;
  readonly identifierField: string;
};

/**
 * Produces the full faker expression string for a single field.
 *
 * Priority:
 * 1. ref fields → FK lookup from parent entity array
 * 2. enum fields → faker.helpers.arrayElement with literal values
 * 3. role-specific mapping via fieldRoleToFaker
 * 4. kind-based fallback via fieldKindToFaker
 *
 * Nullable refs use faker.helpers.maybe for ~80% non-null probability.
 * Other nullable fields generate non-null values (seed data doesn't require nulls).
 */
export function fieldToFakerExpression(
  _name: string,
  field: FieldDefinition,
  entityVarMap: ReadonlyMap<string, EntitySeedInfo>,
): string {
  // ref → FK lookup from parent entity's seed array
  if (isRefField(field)) {
    const info = entityVarMap.get(field.entity);
    if (!info) {
      return "faker.string.uuid()";
    }
    const expr = `faker.helpers.arrayElement(${info.varName}).${info.identifierField}`;
    if (field.nullable) {
      return `faker.helpers.maybe(() => ${expr}, { probability: 0.8 })`;
    }
    return expr;
  }

  // enum → arrayElement with literal union
  if (isEnumField(field)) {
    const valuesStr = field.values.map((v) => `"${v}"`).join(", ");
    return `faker.helpers.arrayElement([${valuesStr}] as const)`;
  }

  // role-specific mapping
  const roleExpr = fieldRoleToFaker(field.role, field.kind);
  if (roleExpr !== null) return roleExpr;

  // kind-based fallback
  return fieldKindToFaker(field.kind);
}

// ── Entity → Seed Block ────────────────────────────────────

function toVarName(entityName: string): string {
  return toCamelCase(entityName) + "s";
}

function findIdentifierField(entity: EntityDefinition): string {
  for (const [name, field] of Object.entries(entity.fields)) {
    if (field.role === "identifier") return name;
  }
  return "id";
}

/**
 * Generates `export const xxx = Array.from({ length: N }, () => ({...}))` block
 * for a single entity.
 */
export function entityToSeedBlock(
  entity: EntityDefinition,
  varName: string,
  count: number,
  entityVarMap: ReadonlyMap<string, EntitySeedInfo>,
): string {
  const lines: string[] = [];
  lines.push(`export const ${varName} = Array.from({ length: ${count} }, () => ({`);

  for (const [fieldName, field] of Object.entries(entity.fields)) {
    const expr = fieldToFakerExpression(fieldName, field, entityVarMap);
    lines.push(`  ${fieldName}: ${expr},`);
  }

  lines.push("}));");
  return lines.join("\n");
}

// ── Full Seed Data Generation ──────────────────────────────

/**
 * Generates a complete TypeScript seed data file importing @faker-js/faker.
 * Entities are topologically sorted so parent seed arrays exist before
 * child entities reference them via faker.helpers.arrayElement().
 */
export function generateSeedData(schema: EntityRegistry, config?: SeedConfig): string {
  const entities = schema.list();
  if (entities.length === 0) return "";

  const defaultCount = config?.defaultCount ?? DEFAULT_SEED_CONFIG.defaultCount;
  const seed = config?.seed ?? DEFAULT_SEED_CONFIG.seed;
  const sorted = topologicalSort(schema);

  // Build entity name → (varName, identifierField) map
  const entityVarMap = new Map<string, EntitySeedInfo>();
  for (const name of sorted) {
    const entity = schema.get(name);
    entityVarMap.set(name, {
      varName: toVarName(name),
      identifierField: findIdentifierField(entity),
    });
  }

  const lines: string[] = [];
  lines.push(fileHeader());
  lines.push('import { faker } from "@faker-js/faker";');
  lines.push("");
  lines.push(`faker.seed(${seed});`);

  for (const name of sorted) {
    const entity = schema.get(name);
    const info = entityVarMap.get(name)!;
    const count = config?.counts?.[name] ?? defaultCount;
    lines.push("");
    lines.push(entityToSeedBlock(entity, info.varName, count, entityVarMap));
  }

  return lines.join("\n") + "\n";
}

// ── GeneratedFile Entry Point ──────────────────────────────

export function generateSeedDataFile(
  schema: EntityRegistry,
  config?: SeedConfig,
): readonly GeneratedFile[] {
  const content = generateSeedData(schema, config);
  if (!content) return [];

  return [
    {
      path: "seeds/seed-data.ts",
      content,
      purpose: "Faker-based seed data for testing and development",
      regeneratable: true,
    },
  ];
}
