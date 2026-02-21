import { fieldKindToSQLiteType, cascadeRuleToSQLite } from "@dikta/generator";
import type { MigrationDialect } from "../types.js";

const TABLE_REBUILD_COMMENT = [
  "-- NOTE: SQLite does not support this operation via ALTER TABLE.",
  "-- Manual table rebuild required:",
  "--   1. CREATE TABLE new_table (...) with desired schema",
  "--   2. INSERT INTO new_table SELECT ... FROM old_table",
  "--   3. DROP TABLE old_table",
  "--   4. ALTER TABLE new_table RENAME TO old_table",
].join("\n");

export function createSQLiteMigrationDialect(): MigrationDialect {
  const q = (name: string) => `"${name}"`;

  return Object.freeze<MigrationDialect>({
    target: "sqlite",

    quote: q,

    mapFieldType: fieldKindToSQLiteType,

    mapCascade: cascadeRuleToSQLite,

    enumColumnType(_values) {
      // SQLite uses TEXT + CHECK constraint for enums (same as PG)
      return "TEXT";
    },

    createTable(tableName, columnDefs, constraintDefs) {
      const allDefs = [...columnDefs, ...constraintDefs];
      return `CREATE TABLE ${q(tableName)} (\n${allDefs.join(",\n")}\n);`;
    },

    dropTable(tableName) {
      // SQLite does not support CASCADE on DROP TABLE
      return `DROP TABLE IF EXISTS ${q(tableName)};`;
    },

    addColumn(tableName, colName, type, nullable) {
      const nullClause = nullable ? "" : " NOT NULL";
      return `ALTER TABLE ${q(tableName)} ADD COLUMN ${q(colName)} ${type}${nullClause};`;
    },

    dropColumn(tableName, colName) {
      // SQLite 3.35+ supports DROP COLUMN but not IF EXISTS
      return `ALTER TABLE ${q(tableName)} DROP COLUMN ${q(colName)};`;
    },

    alterColumnType(tableName, colName, newType) {
      return [
        `-- ALTER COLUMN TYPE ${q(colName)} to ${newType} on ${q(tableName)}`,
        TABLE_REBUILD_COMMENT,
      ].join("\n");
    },

    setNotNull(tableName, colName, _currentType) {
      return [
        `-- SET NOT NULL on ${q(colName)} of ${q(tableName)}`,
        TABLE_REBUILD_COMMENT,
      ].join("\n");
    },

    dropNotNull(tableName, colName, _currentType) {
      return [
        `-- DROP NOT NULL on ${q(colName)} of ${q(tableName)}`,
        TABLE_REBUILD_COMMENT,
      ].join("\n");
    },

    addEnumConstraint(tableName, colName, _values) {
      return [
        `-- ADD CHECK constraint for enum on ${q(tableName)}.${q(colName)}`,
        `-- SQLite requires CHECK constraints in CREATE TABLE definition.`,
        TABLE_REBUILD_COMMENT,
      ].join("\n");
    },

    dropEnumConstraint(tableName, colName) {
      return [
        `-- DROP CHECK constraint for enum on ${q(tableName)}.${q(colName)}`,
        TABLE_REBUILD_COMMENT,
      ].join("\n");
    },

    addFKConstraint(tableName, colName, targetTable, cascade) {
      return [
        `-- ADD FOREIGN KEY ${q(colName)} -> ${q(targetTable)}("id")${cascade ? ` ${cascade}` : ""} on ${q(tableName)}`,
        `-- SQLite requires FOREIGN KEY constraints in CREATE TABLE definition.`,
        TABLE_REBUILD_COMMENT,
      ].join("\n");
    },

    dropFKConstraint(tableName, colName) {
      return [
        `-- DROP FOREIGN KEY ${q(colName)} on ${q(tableName)}`,
        TABLE_REBUILD_COMMENT,
      ].join("\n");
    },

    verifyTableExists(tableName) {
      return [
        `-- Verify table ${q(tableName)} exists`,
        `SELECT EXISTS (`,
        `  SELECT 1 FROM sqlite_master`,
        `  WHERE type = 'table' AND name = '${tableName}'`,
        `) AS "${tableName}_exists";`,
      ].join("\n");
    },

    verifyTableRemoved(tableName) {
      return [
        `-- Verify table ${q(tableName)} was removed`,
        `SELECT NOT EXISTS (`,
        `  SELECT 1 FROM sqlite_master`,
        `  WHERE type = 'table' AND name = '${tableName}'`,
        `) AS "${tableName}_removed";`,
      ].join("\n");
    },

    verifyColumnExists(tableName, colName) {
      return [
        `-- Verify column ${q(colName)} on ${q(tableName)}`,
        `SELECT EXISTS (`,
        `  SELECT 1 FROM pragma_table_info('${tableName}')`,
        `  WHERE name = '${colName}'`,
        `) AS "${tableName}_${colName}_exists";`,
      ].join("\n");
    },

    verifyColumnRemoved(tableName, colName) {
      return [
        `-- Verify column ${q(colName)} was removed from ${q(tableName)}`,
        `SELECT NOT EXISTS (`,
        `  SELECT 1 FROM pragma_table_info('${tableName}')`,
        `  WHERE name = '${colName}'`,
        `) AS "${tableName}_${colName}_removed";`,
      ].join("\n");
    },

    verifyColumnDetails(tableName, colName) {
      return [
        `-- Verify column ${q(colName)} on ${q(tableName)} was altered`,
        `SELECT name, type, "notnull"`,
        `FROM pragma_table_info('${tableName}')`,
        `WHERE name = '${colName}';`,
      ].join("\n");
    },
  });
}
