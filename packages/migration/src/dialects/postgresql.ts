import { fieldKindToPGType, cascadeRuleToPG } from "@dikta/generator";
import type { MigrationDialect } from "../types.js";

export function createPostgreSQLMigrationDialect(): MigrationDialect {
  const q = (name: string) => `"${name}"`;

  return Object.freeze<MigrationDialect>({
    target: "postgresql",

    quote: q,

    mapFieldType: fieldKindToPGType,

    mapCascade: cascadeRuleToPG,

    enumColumnType(_values) {
      // PG uses TEXT + CHECK constraint for enums
      return "TEXT";
    },

    createTable(tableName, columnDefs, constraintDefs) {
      const allDefs = [...columnDefs, ...constraintDefs];
      return `CREATE TABLE ${q(tableName)} (\n${allDefs.join(",\n")}\n);`;
    },

    dropTable(tableName) {
      return `DROP TABLE IF EXISTS ${q(tableName)} CASCADE;`;
    },

    dropColumn(tableName, colName) {
      return `ALTER TABLE ${q(tableName)} DROP COLUMN IF EXISTS ${q(colName)};`;
    },

    addColumn(tableName, colName, type, nullable) {
      const nullClause = nullable ? "" : " NOT NULL";
      return `ALTER TABLE ${q(tableName)} ADD COLUMN ${q(colName)} ${type}${nullClause};`;
    },

    alterColumnType(tableName, colName, newType) {
      return `ALTER TABLE ${q(tableName)} ALTER COLUMN ${q(colName)} TYPE ${newType} USING ${q(colName)}::${newType};`;
    },

    setNotNull(tableName, colName, _currentType) {
      return `ALTER TABLE ${q(tableName)} ALTER COLUMN ${q(colName)} SET NOT NULL;`;
    },

    dropNotNull(tableName, colName, _currentType) {
      return `ALTER TABLE ${q(tableName)} ALTER COLUMN ${q(colName)} DROP NOT NULL;`;
    },

    addEnumConstraint(tableName, colName, values) {
      const valueList = values.map((v) => `'${v}'`).join(", ");
      return `ALTER TABLE ${q(tableName)} ADD CONSTRAINT "chk_${tableName}_${colName}" CHECK (${q(colName)} IN (${valueList}));`;
    },

    dropEnumConstraint(tableName, colName) {
      return `ALTER TABLE ${q(tableName)} DROP CONSTRAINT IF EXISTS "chk_${tableName}_${colName}";`;
    },

    addFKConstraint(tableName, colName, targetTable, cascade) {
      const parts = [
        `ALTER TABLE ${q(tableName)} ADD CONSTRAINT "fk_${tableName}_${colName}"`,
        `FOREIGN KEY (${q(colName)}) REFERENCES ${q(targetTable)} (${q("id")})`,
      ];
      if (cascade) {
        parts[1] += ` ${cascade}`;
      }
      return parts.join(" ") + ";";
    },

    dropFKConstraint(tableName, colName) {
      return `ALTER TABLE ${q(tableName)} DROP CONSTRAINT IF EXISTS "fk_${tableName}_${colName}";`;
    },

    verifyTableExists(tableName) {
      return [
        `-- Verify table ${q(tableName)} exists`,
        `SELECT EXISTS (`,
        `  SELECT 1 FROM information_schema.tables`,
        `  WHERE table_name = '${tableName}'`,
        `) AS "${tableName}_exists";`,
      ].join("\n");
    },

    verifyTableRemoved(tableName) {
      return [
        `-- Verify table ${q(tableName)} was removed`,
        `SELECT NOT EXISTS (`,
        `  SELECT 1 FROM information_schema.tables`,
        `  WHERE table_name = '${tableName}'`,
        `) AS "${tableName}_removed";`,
      ].join("\n");
    },

    verifyColumnExists(tableName, colName) {
      return [
        `-- Verify column ${q(colName)} on ${q(tableName)}`,
        `SELECT EXISTS (`,
        `  SELECT 1 FROM information_schema.columns`,
        `  WHERE table_name = '${tableName}'`,
        `  AND column_name = '${colName}'`,
        `) AS "${tableName}_${colName}_exists";`,
      ].join("\n");
    },

    verifyColumnRemoved(tableName, colName) {
      return [
        `-- Verify column ${q(colName)} was removed from ${q(tableName)}`,
        `SELECT NOT EXISTS (`,
        `  SELECT 1 FROM information_schema.columns`,
        `  WHERE table_name = '${tableName}'`,
        `  AND column_name = '${colName}'`,
        `) AS "${tableName}_${colName}_removed";`,
      ].join("\n");
    },

    verifyColumnDetails(tableName, colName) {
      return [
        `-- Verify column ${q(colName)} on ${q(tableName)} was altered`,
        `SELECT column_name, data_type, is_nullable`,
        `FROM information_schema.columns`,
        `WHERE table_name = '${tableName}'`,
        `AND column_name = '${colName}';`,
      ].join("\n");
    },
  });
}
