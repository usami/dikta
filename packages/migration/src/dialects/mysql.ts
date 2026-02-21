import { fieldKindToMySQLType, cascadeRuleToMySQL } from "@dikta/generator";
import type { MigrationDialect } from "../types.js";

export function createMySQLMigrationDialect(): MigrationDialect {
  const q = (name: string) => `\`${name}\``;

  return Object.freeze<MigrationDialect>({
    target: "mysql",

    quote: q,

    mapFieldType: fieldKindToMySQLType,

    mapCascade: cascadeRuleToMySQL,

    enumColumnType(values) {
      // MySQL uses native ENUM() column type
      const valueList = values.map((v) => `'${v}'`).join(", ");
      return `ENUM(${valueList})`;
    },

    createTable(tableName, columnDefs, constraintDefs) {
      const allDefs = [...columnDefs, ...constraintDefs];
      return `CREATE TABLE ${q(tableName)} (\n${allDefs.join(",\n")}\n) ENGINE=InnoDB;`;
    },

    dropTable(tableName) {
      // MySQL does not support CASCADE on DROP TABLE
      return `DROP TABLE IF EXISTS ${q(tableName)};`;
    },

    addColumn(tableName, colName, type, nullable) {
      const nullClause = nullable ? "" : " NOT NULL";
      return `ALTER TABLE ${q(tableName)} ADD COLUMN ${q(colName)} ${type}${nullClause};`;
    },

    alterColumnType(tableName, colName, newType) {
      // MySQL uses MODIFY COLUMN instead of ALTER COLUMN ... TYPE
      return `ALTER TABLE ${q(tableName)} MODIFY COLUMN ${q(colName)} ${newType};`;
    },

    setNotNull(tableName, colName, currentType) {
      // MySQL MODIFY COLUMN requires the full column definition
      return `ALTER TABLE ${q(tableName)} MODIFY COLUMN ${q(colName)} ${currentType} NOT NULL;`;
    },

    dropNotNull(tableName, colName, currentType) {
      // MySQL MODIFY COLUMN requires the full column definition
      return `ALTER TABLE ${q(tableName)} MODIFY COLUMN ${q(colName)} ${currentType} NULL;`;
    },

    addEnumConstraint(_tableName, _colName, _values) {
      // MySQL uses native ENUM — no separate CHECK constraint needed
      return null;
    },

    dropEnumConstraint(_tableName, _colName) {
      // MySQL uses native ENUM — no constraint to drop
      return null;
    },

    addFKConstraint(tableName, colName, targetTable, cascade) {
      const parts = [
        `ALTER TABLE ${q(tableName)} ADD CONSTRAINT ${q(`fk_${tableName}_${colName}`)}`,
        `FOREIGN KEY (${q(colName)}) REFERENCES ${q(targetTable)} (${q("id")})`,
      ];
      if (cascade) {
        parts[1] += ` ${cascade}`;
      }
      return parts.join(" ") + ";";
    },

    dropFKConstraint(tableName, colName) {
      // MySQL uses DROP FOREIGN KEY instead of DROP CONSTRAINT
      return `ALTER TABLE ${q(tableName)} DROP FOREIGN KEY ${q(`fk_${tableName}_${colName}`)};`;
    },

    verifyTableExists(tableName) {
      return [
        `-- Verify table ${q(tableName)} exists`,
        `SELECT EXISTS (`,
        `  SELECT 1 FROM information_schema.tables`,
        `  WHERE table_name = '${tableName}'`,
        `  AND table_schema = DATABASE()`,
        `) AS \`${tableName}_exists\`;`,
      ].join("\n");
    },

    verifyTableRemoved(tableName) {
      return [
        `-- Verify table ${q(tableName)} was removed`,
        `SELECT NOT EXISTS (`,
        `  SELECT 1 FROM information_schema.tables`,
        `  WHERE table_name = '${tableName}'`,
        `  AND table_schema = DATABASE()`,
        `) AS \`${tableName}_removed\`;`,
      ].join("\n");
    },

    verifyColumnExists(tableName, colName) {
      return [
        `-- Verify column ${q(colName)} on ${q(tableName)}`,
        `SELECT EXISTS (`,
        `  SELECT 1 FROM information_schema.columns`,
        `  WHERE table_name = '${tableName}'`,
        `  AND column_name = '${colName}'`,
        `  AND table_schema = DATABASE()`,
        `) AS \`${tableName}_${colName}_exists\`;`,
      ].join("\n");
    },

    verifyColumnRemoved(tableName, colName) {
      return [
        `-- Verify column ${q(colName)} was removed from ${q(tableName)}`,
        `SELECT NOT EXISTS (`,
        `  SELECT 1 FROM information_schema.columns`,
        `  WHERE table_name = '${tableName}'`,
        `  AND column_name = '${colName}'`,
        `  AND table_schema = DATABASE()`,
        `) AS \`${tableName}_${colName}_removed\`;`,
      ].join("\n");
    },

    verifyColumnDetails(tableName, colName) {
      return [
        `-- Verify column ${q(colName)} on ${q(tableName)} was altered`,
        `SELECT column_name, data_type, is_nullable`,
        `FROM information_schema.columns`,
        `WHERE table_name = '${tableName}'`,
        `AND column_name = '${colName}'`,
        `AND table_schema = DATABASE();`,
      ].join("\n");
    },
  });
}
