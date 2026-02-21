import type { FieldKind, FieldRole, CascadeRule } from "@dikta/core";
import type { SQLDialect } from "../../types.js";
import { fieldKindToMySQLType, cascadeRuleToMySQL } from "./types.js";

export function createMySQLDialect(): SQLDialect {
  return Object.freeze({
    target: "mysql" as const,

    fieldKindToSQLType(kind: FieldKind, role: FieldRole): string {
      return fieldKindToMySQLType(kind, role);
    },

    cascadeRuleToSQL(rule: CascadeRule): string | null {
      return cascadeRuleToMySQL(rule);
    },

    quoteIdentifier(name: string): string {
      return `\`${name}\``;
    },

    generateEnumConstraint(
      _tableName: string,
      _columnName: string,
      values: readonly string[],
    ): string {
      // MySQL uses native ENUM() column type — return the type expression
      const valueList = values.map((v) => `'${v}'`).join(", ");
      return `ENUM(${valueList})`;
    },

    generateTableComment(
      _tableName: string,
      _columnName: string,
      comment: string,
    ): string {
      const escaped = comment.replace(/'/g, "\\'");
      return `COMMENT '${escaped}'`;
    },

    tableOptions: " ENGINE=InnoDB",

    driverImport: "mysql2/promise",
    driverConnectionType: "Pool",

    parameterPlaceholder(_index: number): string {
      return "?";
    },
  });
}
