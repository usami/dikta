import type { FieldKind, FieldRole, CascadeRule } from "@dikta/core";
import type { SQLDialect } from "../../types.js";
import { fieldKindToPGType, cascadeRuleToPG } from "./types.js";

export function createPostgreSQLDialect(): SQLDialect {
  return Object.freeze({
    target: "postgresql" as const,

    fieldKindToSQLType(kind: FieldKind, role: FieldRole): string {
      return fieldKindToPGType(kind, role);
    },

    cascadeRuleToSQL(rule: CascadeRule): string | null {
      return cascadeRuleToPG(rule);
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
      tableName: string,
      columnName: string,
      comment: string,
    ): string {
      const escaped = comment.replace(/'/g, "''");
      return `COMMENT ON COLUMN "${tableName}"."${columnName}" IS '${escaped}';`;
    },

    tableOptions: "",

    driverImport: "postgres",
    driverConnectionType: "Sql",

    parameterPlaceholder(index: number): string {
      return `$${index}`;
    },
  });
}
