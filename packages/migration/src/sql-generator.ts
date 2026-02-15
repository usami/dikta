import type { EntityRegistry } from "@dikta/core";
import type { GeneratedFile } from "@dikta/generator";
import {
  fileHeader,
  toSnakeCase,
  toTableName,
  fieldKindToPGType,
  cascadeRuleToPG,
} from "@dikta/generator";
import type {
  SchemaChange,
  MigrationFiles,
  MigrationMetadata,
  MigrationImpact,
  SafetyEvaluation,
  MigrationDefinition,
  FieldSpec,
} from "./types.js";

// ── Public API ──────────────────────────────────────────────

export function generateMigrationFiles(
  migration: MigrationDefinition,
  impact: MigrationImpact,
  safety: SafetyEvaluation,
  _schema?: EntityRegistry,
): MigrationFiles {
  const changes = migration.config.changes;

  const up = generateUpSQL(changes);
  const down = generateDownSQL(changes);
  const verify = generateVerifySQL(changes);
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
): readonly GeneratedFile[] {
  const files = generateMigrationFiles(migration, impact, safety, schema);
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

function generateUpSQL(changes: readonly SchemaChange[]): string {
  const lines: string[] = [
    fileHeader(),
    "-- Forward migration (up)",
    "",
    "BEGIN;",
    "",
  ];

  for (const change of changes) {
    lines.push(...generateUpChange(change));
    lines.push("");
  }

  lines.push("COMMIT;", "");
  return lines.join("\n");
}

function generateUpChange(change: SchemaChange): string[] {
  switch (change.kind) {
    case "add_entity":
      return generateCreateTable(change.entity, change.fields);
    case "remove_entity":
      return [`DROP TABLE IF EXISTS "${toTableName(change.entity)}" CASCADE;`];
    case "rename_entity":
      return [
        `ALTER TABLE "${toTableName(change.from)}" RENAME TO "${toTableName(change.to)}";`,
      ];
    case "add_field":
      return generateAddColumn(change.entity, change.field, change.spec, change.backfill);
    case "remove_field":
      return [
        `ALTER TABLE "${toTableName(change.entity)}" DROP COLUMN IF EXISTS "${toSnakeCase(change.field)}";`,
      ];
    case "rename_field":
      return [
        `ALTER TABLE "${toTableName(change.entity)}" RENAME COLUMN "${toSnakeCase(change.from)}" TO "${toSnakeCase(change.to)}";`,
      ];
    case "alter_field":
      return generateAlterColumn(change.entity, change.field, change);
    case "add_invariant":
      return [`-- Application invariant added: ${change.invariant}`];
    case "remove_invariant":
      return [`-- Application invariant removed: ${change.invariant}`];
  }
}

function generateCreateTable(
  entityName: string,
  fields: Readonly<Record<string, FieldSpec>>,
): string[] {
  const tableName = toTableName(entityName);
  const lines: string[] = [`CREATE TABLE "${tableName}" (`];
  const columnDefs: string[] = [];

  for (const [fieldName, spec] of Object.entries(fields)) {
    const colName = toSnakeCase(fieldName);
    const pgType = spec.pgType ?? fieldKindToPGType(spec.kind, spec.role ?? "general");
    const nullable = spec.nullable ? "" : " NOT NULL";
    let extra = "";

    if (spec.role === "identifier") {
      extra = " PRIMARY KEY";
    }

    columnDefs.push(`  "${colName}" ${pgType}${nullable}${extra}`);
  }

  lines.push(columnDefs.join(",\n"));
  lines.push(");");

  // Add CHECK constraints for enum fields
  for (const [fieldName, spec] of Object.entries(fields)) {
    if (spec.kind === "enum" && spec.values && spec.values.length > 0) {
      const colName = toSnakeCase(fieldName);
      const valueList = spec.values.map((v) => `'${v}'`).join(", ");
      lines.push(
        `ALTER TABLE "${tableName}" ADD CONSTRAINT "chk_${tableName}_${colName}" CHECK ("${colName}" IN (${valueList}));`,
      );
    }
  }

  // Add FOREIGN KEY constraints for ref fields
  for (const [fieldName, spec] of Object.entries(fields)) {
    if (spec.kind === "ref" && spec.entity) {
      const colName = toSnakeCase(fieldName);
      const targetTable = toTableName(spec.entity);
      const cascadeClause = spec.cascade ? cascadeRuleToPG(spec.cascade) : null;
      const fkParts = [
        `ALTER TABLE "${tableName}" ADD CONSTRAINT "fk_${tableName}_${colName}"`,
        `FOREIGN KEY ("${colName}") REFERENCES "${targetTable}" ("id")`,
      ];
      if (cascadeClause) {
        fkParts[1] += ` ${cascadeClause}`;
      }
      lines.push(fkParts.join(" ") + ";");
    }
  }

  return lines;
}

function generateAddColumn(
  entity: string,
  field: string,
  spec: FieldSpec,
  backfill?: string,
): string[] {
  const tableName = toTableName(entity);
  const colName = toSnakeCase(field);
  const pgType = spec.pgType ?? fieldKindToPGType(spec.kind, spec.role ?? "general");
  const isNullable = spec.nullable ?? false;
  const lines: string[] = [];

  if (!isNullable && backfill) {
    // Three-step: add nullable, backfill, set NOT NULL
    lines.push(`-- Step 1: Add column as nullable`);
    lines.push(`ALTER TABLE "${tableName}" ADD COLUMN "${colName}" ${pgType};`);
    lines.push(`-- Step 2: Backfill existing rows`);
    lines.push(`UPDATE "${tableName}" SET "${colName}" = ${backfill};`);
    lines.push(`-- Step 3: Set NOT NULL constraint`);
    lines.push(`ALTER TABLE "${tableName}" ALTER COLUMN "${colName}" SET NOT NULL;`);
  } else {
    const nullable = isNullable ? "" : " NOT NULL";
    lines.push(`ALTER TABLE "${tableName}" ADD COLUMN "${colName}" ${pgType}${nullable};`);
  }

  // CHECK constraint for enum
  if (spec.kind === "enum" && spec.values && spec.values.length > 0) {
    const valueList = spec.values.map((v) => `'${v}'`).join(", ");
    lines.push(
      `ALTER TABLE "${tableName}" ADD CONSTRAINT "chk_${tableName}_${colName}" CHECK ("${colName}" IN (${valueList}));`,
    );
  }

  // FK constraint for ref
  if (spec.kind === "ref" && spec.entity) {
    const targetTable = toTableName(spec.entity);
    const cascadeClause = spec.cascade ? cascadeRuleToPG(spec.cascade) : null;
    const fkParts = [
      `ALTER TABLE "${tableName}" ADD CONSTRAINT "fk_${tableName}_${colName}"`,
      `FOREIGN KEY ("${colName}") REFERENCES "${targetTable}" ("id")`,
    ];
    if (cascadeClause) {
      fkParts[1] += ` ${cascadeClause}`;
    }
    lines.push(fkParts.join(" ") + ";");
  }

  return lines;
}

function generateAlterColumn(
  entity: string,
  field: string,
  change: SchemaChange & { kind: "alter_field" },
): string[] {
  const tableName = toTableName(entity);
  const colName = toSnakeCase(field);
  const lines: string[] = [];
  const { changes } = change;

  if (changes.kind) {
    const newPgType = fieldKindToPGType(changes.kind.to, "general");
    lines.push(
      `ALTER TABLE "${tableName}" ALTER COLUMN "${colName}" TYPE ${newPgType} USING "${colName}"::${newPgType};`,
    );
  }

  if (changes.nullable) {
    if (changes.nullable.to === false) {
      lines.push(
        `ALTER TABLE "${tableName}" ALTER COLUMN "${colName}" SET NOT NULL;`,
      );
    } else {
      lines.push(
        `ALTER TABLE "${tableName}" ALTER COLUMN "${colName}" DROP NOT NULL;`,
      );
    }
  }

  if (changes.values) {
    // Update CHECK constraint for enum
    if (changes.values.added.length > 0 || changes.values.removed.length > 0) {
      lines.push(`-- Update enum CHECK constraint`);
      lines.push(
        `ALTER TABLE "${tableName}" DROP CONSTRAINT IF EXISTS "chk_${tableName}_${colName}";`,
      );
      // We need the final set of values — but we only have added/removed
      // The caller should provide the full set; for now, note it
      if (changes.values.removed.length > 0) {
        lines.push(
          `-- WARNING: Values removed (${changes.values.removed.join(", ")}). Ensure no rows contain these values.`,
        );
      }
    }
  }

  if (changes.cascade) {
    const newCascade = cascadeRuleToPG(changes.cascade.to);
    lines.push(`-- Update cascade rule`);
    lines.push(
      `ALTER TABLE "${tableName}" DROP CONSTRAINT IF EXISTS "fk_${tableName}_${colName}";`,
    );
    if (newCascade) {
      lines.push(
        `-- Re-add FK with new cascade rule (requires target table reference)`,
      );
    }
  }

  if (lines.length === 0) {
    lines.push(`-- Metadata-only change on "${tableName}"."${colName}" (no SQL required)`);
  }

  return lines;
}

// ── down.sql generation ─────────────────────────────────────

function generateDownSQL(changes: readonly SchemaChange[]): string {
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
    lines.push(...generateDownChange(change));
    lines.push("");
  }

  lines.push("COMMIT;", "");
  return lines.join("\n");
}

function generateDownChange(change: SchemaChange): string[] {
  switch (change.kind) {
    case "add_entity":
      return [`DROP TABLE IF EXISTS "${toTableName(change.entity)}" CASCADE;`];

    case "remove_entity":
      return [
        `-- WARNING: Cannot fully reverse DROP TABLE. Data has been lost.`,
        `-- The table structure would need to be recreated manually.`,
      ];

    case "rename_entity":
      return [
        `ALTER TABLE "${toTableName(change.to)}" RENAME TO "${toTableName(change.from)}";`,
      ];

    case "add_field":
      return [
        `ALTER TABLE "${toTableName(change.entity)}" DROP COLUMN IF EXISTS "${toSnakeCase(change.field)}";`,
      ];

    case "remove_field":
      return [
        `-- WARNING: Cannot reverse DROP COLUMN. Data for "${change.entity}.${change.field}" has been lost.`,
      ];

    case "rename_field":
      return [
        `ALTER TABLE "${toTableName(change.entity)}" RENAME COLUMN "${toSnakeCase(change.to)}" TO "${toSnakeCase(change.from)}";`,
      ];

    case "alter_field":
      return generateReverseAlter(change);

    case "add_invariant":
      return [`-- Reverse: remove application invariant: ${change.invariant}`];

    case "remove_invariant":
      return [`-- Reverse: re-add application invariant: ${change.invariant}`];
  }
}

function generateReverseAlter(
  change: SchemaChange & { kind: "alter_field" },
): string[] {
  const tableName = toTableName(change.entity);
  const colName = toSnakeCase(change.field);
  const lines: string[] = [];
  const { changes } = change;

  if (changes.kind) {
    const oldPgType = fieldKindToPGType(changes.kind.from, "general");
    lines.push(
      `ALTER TABLE "${tableName}" ALTER COLUMN "${colName}" TYPE ${oldPgType} USING "${colName}"::${oldPgType};`,
    );
  }

  if (changes.nullable) {
    if (changes.nullable.from === false) {
      lines.push(
        `ALTER TABLE "${tableName}" ALTER COLUMN "${colName}" SET NOT NULL;`,
      );
    } else {
      lines.push(
        `ALTER TABLE "${tableName}" ALTER COLUMN "${colName}" DROP NOT NULL;`,
      );
    }
  }

  if (changes.values && changes.values.removed.length > 0) {
    lines.push(
      `-- WARNING: Cannot reverse enum value removal. Values ${changes.values.removed.join(", ")} may have been lost.`,
    );
  }

  if (lines.length === 0) {
    lines.push(`-- Reverse metadata-only change on "${tableName}"."${colName}"`);
  }

  return lines;
}

// ── verify.sql generation ───────────────────────────────────

function generateVerifySQL(changes: readonly SchemaChange[]): string {
  const lines: string[] = [
    fileHeader(),
    "-- Verification queries",
    "-- Run after migration to verify it was applied correctly.",
    "",
  ];

  for (const change of changes) {
    lines.push(...generateVerifyChange(change));
    lines.push("");
  }

  return lines.join("\n");
}

function generateVerifyChange(change: SchemaChange): string[] {
  switch (change.kind) {
    case "add_entity":
      return [
        `-- Verify table "${toTableName(change.entity)}" exists`,
        `SELECT EXISTS (`,
        `  SELECT 1 FROM information_schema.tables`,
        `  WHERE table_name = '${toTableName(change.entity)}'`,
        `) AS "${toTableName(change.entity)}_exists";`,
      ];

    case "remove_entity":
      return [
        `-- Verify table "${toTableName(change.entity)}" was removed`,
        `SELECT NOT EXISTS (`,
        `  SELECT 1 FROM information_schema.tables`,
        `  WHERE table_name = '${toTableName(change.entity)}'`,
        `) AS "${toTableName(change.entity)}_removed";`,
      ];

    case "rename_entity":
      return [
        `-- Verify table renamed from "${toTableName(change.from)}" to "${toTableName(change.to)}"`,
        `SELECT EXISTS (`,
        `  SELECT 1 FROM information_schema.tables`,
        `  WHERE table_name = '${toTableName(change.to)}'`,
        `) AS "${toTableName(change.to)}_exists";`,
      ];

    case "add_field":
      return [
        `-- Verify column "${toSnakeCase(change.field)}" on "${toTableName(change.entity)}"`,
        `SELECT EXISTS (`,
        `  SELECT 1 FROM information_schema.columns`,
        `  WHERE table_name = '${toTableName(change.entity)}'`,
        `  AND column_name = '${toSnakeCase(change.field)}'`,
        `) AS "${toTableName(change.entity)}_${toSnakeCase(change.field)}_exists";`,
      ];

    case "remove_field":
      return [
        `-- Verify column "${toSnakeCase(change.field)}" was removed from "${toTableName(change.entity)}"`,
        `SELECT NOT EXISTS (`,
        `  SELECT 1 FROM information_schema.columns`,
        `  WHERE table_name = '${toTableName(change.entity)}'`,
        `  AND column_name = '${toSnakeCase(change.field)}'`,
        `) AS "${toTableName(change.entity)}_${toSnakeCase(change.field)}_removed";`,
      ];

    case "rename_field":
      return [
        `-- Verify column renamed from "${toSnakeCase(change.from)}" to "${toSnakeCase(change.to)}" on "${toTableName(change.entity)}"`,
        `SELECT EXISTS (`,
        `  SELECT 1 FROM information_schema.columns`,
        `  WHERE table_name = '${toTableName(change.entity)}'`,
        `  AND column_name = '${toSnakeCase(change.to)}'`,
        `) AS "${toTableName(change.entity)}_${toSnakeCase(change.to)}_exists";`,
      ];

    case "alter_field":
      return [
        `-- Verify column "${toSnakeCase(change.field)}" on "${toTableName(change.entity)}" was altered`,
        `SELECT column_name, data_type, is_nullable`,
        `FROM information_schema.columns`,
        `WHERE table_name = '${toTableName(change.entity)}'`,
        `AND column_name = '${toSnakeCase(change.field)}';`,
      ];

    case "add_invariant":
    case "remove_invariant":
      return [`-- Invariant changes are application-level (no SQL verification needed)`];
  }
}
