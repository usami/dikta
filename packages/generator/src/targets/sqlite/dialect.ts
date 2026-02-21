import type { FieldKind, FieldRole, CascadeRule } from "@dikta/core";
import type { SQLDialect } from "../../types.js";
import { fieldKindToSQLiteType, cascadeRuleToSQLite } from "./types.js";

export function createSQLiteDialect(): SQLDialect {
  return Object.freeze({
    target: "sqlite" as const,

    fieldKindToSQLType(kind: FieldKind, role: FieldRole): string {
      return fieldKindToSQLiteType(kind, role);
    },

    cascadeRuleToSQL(rule: CascadeRule): string | null {
      return cascadeRuleToSQLite(rule);
    },

    quoteIdentifier(name: string): string {
      return `"${name}"`;
    },

    generateEnumConstraint(
      tableName: string,
      columnName: string,
      values: readonly string[],
    ): string {
      const valueList = values.map((v) => `'${v}'`).join(", ");
      return `CONSTRAINT "chk_${tableName}_${columnName}" CHECK ("${columnName}" IN (${valueList}))`;
    },

    generateTableComment(
      _tableName: string,
      columnName: string,
      comment: string,
    ): string {
      // SQLite has no COMMENT ON — emit a SQL comment instead
      return `-- ${columnName}: ${comment}`;
    },

    tableOptions: "",

    driverImport: "better-sqlite3",
    driverConnectionType: "Database",

    parameterPlaceholder(_index: number): string {
      return "?";
    },
  });
}
