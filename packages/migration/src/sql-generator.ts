import type { EntityRegistry } from "@dikta/core";
import type { GeneratedFile, DatabaseTarget } from "@dikta/generator";
import { fileHeader, toSnakeCase, toTableName } from "@dikta/generator";
import type {
  SchemaChange,
  MigrationFiles,
  MigrationMetadata,
  MigrationImpact,
  SafetyEvaluation,
  MigrationDefinition,
  MigrationDialect,
  FieldSpec,
} from "./types.js";
import { createMigrationDialect } from "./dialects/factory.js";

// ── Public API ──────────────────────────────────────────────

export function generateMigrationFiles(
  migration: MigrationDefinition,
  impact: MigrationImpact,
  safety: SafetyEvaluation,
  _schema?: EntityRegistry,
  target: DatabaseTarget = "postgresql",
): MigrationFiles {
  const dialect = createMigrationDialect(target);
  const changes = migration.config.changes;

  const up = generateUpSQL(changes, dialect);
  const down = generateDownSQL(changes, dialect);
  const verify = generateVerifySQL(changes, dialect);
  const metadata: MigrationMetadata = {
    name: migration.name,
    description: migration.config.description ?? "",
    timestamp: migration.config.timestamp ?? new Date().toISOString(),
    changes,
    safety,
    impact,
  };

  return Object.freeze({ up, down, verify, metadata: Object.freeze(metadata) });
}

export function generateMigrationDirectory(
  migration: MigrationDefinition,
  impact: MigrationImpact,
  safety: SafetyEvaluation,
  schema?: EntityRegistry,
  target: DatabaseTarget = "postgresql",
): readonly GeneratedFile[] {
  const files = generateMigrationFiles(migration, impact, safety, schema, target);
  const timestamp = migration.config.timestamp
    ? migration.config.timestamp.replace(/[^0-9]/g, "").slice(0, 14)
    : new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  const dirName = `${timestamp}_${toSnakeCase(migration.name)}`;
  const basePath = `migrations/${dirName}`;

  return Object.freeze([
    Object.freeze({
      path: `${basePath}/up.sql`,
      content: files.up,
      purpose: `Forward migration: ${migration.name}`,
      regeneratable: false,
    }),
    Object.freeze({
      path: `${basePath}/down.sql`,
      content: files.down,
      purpose: `Rollback migration: ${migration.name}`,
      regeneratable: false,
    }),
    Object.freeze({
      path: `${basePath}/verify.sql`,
      content: files.verify,
      purpose: `Verification queries: ${migration.name}`,
      regeneratable: false,
    }),
    Object.freeze({
      path: `${basePath}/metadata.json`,
      content: JSON.stringify(files.metadata, null, 2) + "\n",
      purpose: `Migration metadata: ${migration.name}`,
      regeneratable: false,
    }),
  ]);
}

// ── up.sql generation ───────────────────────────────────────

function generateUpSQL(changes: readonly SchemaChange[], dialect: MigrationDialect): string {
  const lines: string[] = [
    fileHeader(),
    "-- Forward migration (up)",
    "",
    "BEGIN;",
    "",
  ];

  for (const change of changes) {
    lines.push(...generateUpChange(change, dialect));
    lines.push("");
  }

  lines.push("COMMIT;", "");
  return lines.join("\n");
}

function generateUpChange(change: SchemaChange, dialect: MigrationDialect): string[] {
  const q = dialect.quote.bind(dialect);

  switch (change.kind) {
    case "add_entity":
      return generateCreateTable(change.entity, change.fields, dialect);
    case "remove_entity":
      return [dialect.dropTable(toTableName(change.entity))];
    case "rename_entity":
      return [
        `ALTER TABLE ${q(toTableName(change.from))} RENAME TO ${q(toTableName(change.to))};`,
      ];
    case "add_field":
      return generateAddColumn(change.entity, change.field, change.spec, dialect, change.backfill);
    case "remove_field":
      return [
        `ALTER TABLE ${q(toTableName(change.entity))} DROP COLUMN IF EXISTS ${q(toSnakeCase(change.field))};`,
      ];
    case "rename_field":
      return [
        `ALTER TABLE ${q(toTableName(change.entity))} RENAME COLUMN ${q(toSnakeCase(change.from))} TO ${q(toSnakeCase(change.to))};`,
      ];
    case "alter_field":
      return generateAlterColumn(change.entity, change.field, change, dialect);
    case "add_invariant":
      return [`-- Application invariant added: ${change.invariant}`];
    case "remove_invariant":
      return [`-- Application invariant removed: ${change.invariant}`];
  }
}

function generateCreateTable(
  entityName: string,
  fields: Readonly<Record<string, FieldSpec>>,
  dialect: MigrationDialect,
): string[] {
  const tableName = toTableName(entityName);
  const q = dialect.quote.bind(dialect);
  const columnDefs: string[] = [];
  const constraintDefs: string[] = [];

  for (const [fieldName, spec] of Object.entries(fields)) {
    const colName = toSnakeCase(fieldName);
    let colType: string;

    if (spec.rawType) {
      colType = spec.rawType;
    } else if (spec.kind === "enum" && spec.values && spec.values.length > 0) {
      colType = dialect.enumColumnType(spec.values);
    } else {
      colType = dialect.mapFieldType(spec.kind, spec.role ?? "general");
    }

    const nullable = spec.nullable ? "" : " NOT NULL";
    let extra = "";

    if (spec.role === "identifier") {
      extra = " PRIMARY KEY";
    }

    columnDefs.push(`  ${q(colName)} ${colType}${nullable}${extra}`);
  }

  const lines: string[] = [dialect.createTable(tableName, columnDefs, constraintDefs)];

  // Add CHECK constraints for enum fields (PG only — MySQL uses native ENUM)
  for (const [fieldName, spec] of Object.entries(fields)) {
    if (spec.kind === "enum" && spec.values && spec.values.length > 0) {
      const colName = toSnakeCase(fieldName);
      const constraint = dialect.addEnumConstraint(tableName, colName, spec.values);
      if (constraint) {
        lines.push(constraint);
      }
    }
  }

  // Add FOREIGN KEY constraints for ref fields
  for (const [fieldName, spec] of Object.entries(fields)) {
    if (spec.kind === "ref" && spec.entity) {
      const colName = toSnakeCase(fieldName);
      const targetTable = toTableName(spec.entity);
      const cascadeClause = spec.cascade ? dialect.mapCascade(spec.cascade) : null;
      lines.push(dialect.addFKConstraint(tableName, colName, targetTable, cascadeClause));
    }
  }

  return lines;
}

function generateAddColumn(
  entity: string,
  field: string,
  spec: FieldSpec,
  dialect: MigrationDialect,
  backfill?: string,
): string[] {
  const tableName = toTableName(entity);
  const colName = toSnakeCase(field);
  const q = dialect.quote.bind(dialect);
  let colType: string;

  if (spec.rawType) {
    colType = spec.rawType;
  } else if (spec.kind === "enum" && spec.values && spec.values.length > 0) {
    colType = dialect.enumColumnType(spec.values);
  } else {
    colType = dialect.mapFieldType(spec.kind, spec.role ?? "general");
  }

  const isNullable = spec.nullable ?? false;
  const lines: string[] = [];

  if (!isNullable && backfill) {
    // Three-step: add nullable, backfill, set NOT NULL
    lines.push(`-- Step 1: Add column as nullable`);
    lines.push(dialect.addColumn(tableName, colName, colType, true));
    lines.push(`-- Step 2: Backfill existing rows`);
    lines.push(`UPDATE ${q(tableName)} SET ${q(colName)} = ${backfill};`);
    lines.push(`-- Step 3: Set NOT NULL constraint`);
    lines.push(dialect.setNotNull(tableName, colName, colType));
  } else {
    lines.push(dialect.addColumn(tableName, colName, colType, isNullable));
  }

  // CHECK constraint for enum (PG only)
  if (spec.kind === "enum" && spec.values && spec.values.length > 0) {
    const constraint = dialect.addEnumConstraint(tableName, colName, spec.values);
    if (constraint) {
      lines.push(constraint);
    }
  }

  // FK constraint for ref
  if (spec.kind === "ref" && spec.entity) {
    const targetTable = toTableName(spec.entity);
    const cascadeClause = spec.cascade ? dialect.mapCascade(spec.cascade) : null;
    lines.push(dialect.addFKConstraint(tableName, colName, targetTable, cascadeClause));
  }

  return lines;
}

function generateAlterColumn(
  entity: string,
  field: string,
  change: SchemaChange & { kind: "alter_field" },
  dialect: MigrationDialect,
): string[] {
  const tableName = toTableName(entity);
  const colName = toSnakeCase(field);
  const q = dialect.quote.bind(dialect);
  const lines: string[] = [];
  const { changes } = change;

  if (changes.kind) {
    const newType = dialect.mapFieldType(changes.kind.to, "general");
    lines.push(dialect.alterColumnType(tableName, colName, newType));
  }

  if (changes.nullable) {
    // Resolve the current column type for MySQL MODIFY COLUMN
    const currentKind = changes.kind ? changes.kind.to : (change.currentKind ?? "string");
    const currentRole = change.currentRole ?? "general";
    const currentType = dialect.mapFieldType(currentKind, currentRole);

    if (changes.nullable.to === false) {
      lines.push(dialect.setNotNull(tableName, colName, currentType));
    } else {
      lines.push(dialect.dropNotNull(tableName, colName, currentType));
    }
  }

  if (changes.values) {
    // Update CHECK constraint for enum
    if (changes.values.added.length > 0 || changes.values.removed.length > 0) {
      lines.push(`-- Update enum CHECK constraint`);
      const dropConstraint = dialect.dropEnumConstraint(tableName, colName);
      if (dropConstraint) {
        lines.push(dropConstraint);
      }
      if (changes.values.removed.length > 0) {
        lines.push(
          `-- WARNING: Values removed (${changes.values.removed.join(", ")}). Ensure no rows contain these values.`,
        );
      }
    }
  }

  if (changes.cascade) {
    const newCascade = dialect.mapCascade(changes.cascade.to);
    lines.push(`-- Update cascade rule`);
    lines.push(dialect.dropFKConstraint(tableName, colName));
    if (newCascade) {
      lines.push(
        `-- Re-add FK with new cascade rule (requires target table reference)`,
      );
    }
  }

  if (lines.length === 0) {
    lines.push(`-- Metadata-only change on ${q(tableName)}.${q(colName)} (no SQL required)`);
  }

  return lines;
}

// ── down.sql generation ─────────────────────────────────────

function generateDownSQL(changes: readonly SchemaChange[], dialect: MigrationDialect): string {
  const lines: string[] = [
    fileHeader(),
    "-- Rollback migration (down)",
    "",
    "BEGIN;",
    "",
  ];

  // Reverse order for rollback
  const reversed = [...changes].reverse();

  for (const change of reversed) {
    lines.push(...generateDownChange(change, dialect));
    lines.push("");
  }

  lines.push("COMMIT;", "");
  return lines.join("\n");
}

function generateDownChange(change: SchemaChange, dialect: MigrationDialect): string[] {
  const q = dialect.quote.bind(dialect);

  switch (change.kind) {
    case "add_entity":
      return [dialect.dropTable(toTableName(change.entity))];

    case "remove_entity":
      return [
        `-- WARNING: Cannot fully reverse DROP TABLE. Data has been lost.`,
        `-- The table structure would need to be recreated manually.`,
      ];

    case "rename_entity":
      return [
        `ALTER TABLE ${q(toTableName(change.to))} RENAME TO ${q(toTableName(change.from))};`,
      ];

    case "add_field":
      return [
        `ALTER TABLE ${q(toTableName(change.entity))} DROP COLUMN IF EXISTS ${q(toSnakeCase(change.field))};`,
      ];

    case "remove_field":
      return [
        `-- WARNING: Cannot reverse DROP COLUMN. Data for "${change.entity}.${change.field}" has been lost.`,
      ];

    case "rename_field":
      return [
        `ALTER TABLE ${q(toTableName(change.entity))} RENAME COLUMN ${q(toSnakeCase(change.to))} TO ${q(toSnakeCase(change.from))};`,
      ];

    case "alter_field":
      return generateReverseAlter(change, dialect);

    case "add_invariant":
      return [`-- Reverse: remove application invariant: ${change.invariant}`];

    case "remove_invariant":
      return [`-- Reverse: re-add application invariant: ${change.invariant}`];
  }
}

function generateReverseAlter(
  change: SchemaChange & { kind: "alter_field" },
  dialect: MigrationDialect,
): string[] {
  const tableName = toTableName(change.entity);
  const colName = toSnakeCase(change.field);
  const q = dialect.quote.bind(dialect);
  const lines: string[] = [];
  const { changes } = change;

  if (changes.kind) {
    const oldType = dialect.mapFieldType(changes.kind.from, "general");
    lines.push(dialect.alterColumnType(tableName, colName, oldType));
  }

  if (changes.nullable) {
    // Resolve the type for the reverse direction
    const currentKind = changes.kind ? changes.kind.from : (change.currentKind ?? "string");
    const currentRole = change.currentRole ?? "general";
    const currentType = dialect.mapFieldType(currentKind, currentRole);

    if (changes.nullable.from === false) {
      lines.push(dialect.setNotNull(tableName, colName, currentType));
    } else {
      lines.push(dialect.dropNotNull(tableName, colName, currentType));
    }
  }

  if (changes.values && changes.values.removed.length > 0) {
    lines.push(
      `-- WARNING: Cannot reverse enum value removal. Values ${changes.values.removed.join(", ")} may have been lost.`,
    );
  }

  if (lines.length === 0) {
    lines.push(`-- Reverse metadata-only change on ${q(tableName)}.${q(colName)}`);
  }

  return lines;
}

// ── verify.sql generation ───────────────────────────────────

function generateVerifySQL(changes: readonly SchemaChange[], dialect: MigrationDialect): string {
  const lines: string[] = [
    fileHeader(),
    "-- Verification queries",
    "-- Run after migration to verify it was applied correctly.",
    "",
  ];

  for (const change of changes) {
    lines.push(generateVerifyChange(change, dialect));
    lines.push("");
  }

  return lines.join("\n");
}

function generateVerifyChange(change: SchemaChange, dialect: MigrationDialect): string {
  switch (change.kind) {
    case "add_entity":
      return dialect.verifyTableExists(toTableName(change.entity));

    case "remove_entity":
      return dialect.verifyTableRemoved(toTableName(change.entity));

    case "rename_entity":
      return dialect.verifyTableExists(toTableName(change.to));

    case "add_field":
      return dialect.verifyColumnExists(toTableName(change.entity), toSnakeCase(change.field));

    case "remove_field":
      return dialect.verifyColumnRemoved(toTableName(change.entity), toSnakeCase(change.field));

    case "rename_field":
      return dialect.verifyColumnExists(toTableName(change.entity), toSnakeCase(change.to));

    case "alter_field":
      return dialect.verifyColumnDetails(toTableName(change.entity), toSnakeCase(change.field));

    case "add_invariant":
    case "remove_invariant":
      return `-- Invariant changes are application-level (no SQL verification needed)`;
  }
}
