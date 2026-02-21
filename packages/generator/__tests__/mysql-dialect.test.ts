import { describe, it, expect } from "vitest";
import { createMySQLDialect } from "../src/targets/mysql/dialect.js";
import type { SQLDialect } from "../src/types.js";

describe("MySQLDialect", () => {
  const dialect: SQLDialect = createMySQLDialect();

  it("should report target as mysql", () => {
    expect(dialect.target).toBe("mysql");
  });

  describe("quoteIdentifier", () => {
    it("should use backticks", () => {
      expect(dialect.quoteIdentifier("users")).toBe("`users`");
      expect(dialect.quoteIdentifier("order_items")).toBe("`order_items`");
    });
  });

  describe("fieldKindToSQLType", () => {
    it("should map basic kinds to MySQL types", () => {
      expect(dialect.fieldKindToSQLType("uuid", "identifier")).toBe("CHAR(36)");
      expect(dialect.fieldKindToSQLType("string", "general")).toBe("VARCHAR(255)");
      expect(dialect.fieldKindToSQLType("integer", "general")).toBe("INT");
      expect(dialect.fieldKindToSQLType("boolean", "general")).toBe("BOOLEAN");
      expect(dialect.fieldKindToSQLType("timestamp", "audit_timestamp")).toBe("DATETIME");
    });

    it("should apply monetary override for decimal", () => {
      expect(dialect.fieldKindToSQLType("decimal", "monetary")).toBe("DECIMAL(19,4)");
      expect(dialect.fieldKindToSQLType("decimal", "general")).toBe("DECIMAL");
    });

    it("should map ref to CHAR(36) matching UUID", () => {
      expect(dialect.fieldKindToSQLType("ref", "reference")).toBe("CHAR(36)");
    });
  });

  describe("cascadeRuleToSQL", () => {
    it("should map cascade rules", () => {
      expect(dialect.cascadeRuleToSQL("cascade")).toBe("ON DELETE CASCADE");
      expect(dialect.cascadeRuleToSQL("restrict")).toBe("ON DELETE RESTRICT");
      expect(dialect.cascadeRuleToSQL("set_null")).toBe("ON DELETE SET NULL");
    });

    it("should return null for soft_delete", () => {
      expect(dialect.cascadeRuleToSQL("soft_delete")).toBeNull();
    });
  });

  describe("parameterPlaceholder", () => {
    it("should produce positional ? placeholders", () => {
      expect(dialect.parameterPlaceholder(1)).toBe("?");
      expect(dialect.parameterPlaceholder(2)).toBe("?");
      expect(dialect.parameterPlaceholder(10)).toBe("?");
    });
  });

  describe("generateEnumConstraint", () => {
    it("should produce native ENUM() type expression", () => {
      const result = dialect.generateEnumConstraint("orders", "status", [
        "pending",
        "shipped",
        "delivered",
      ]);
      expect(result).toBe("ENUM('pending', 'shipped', 'delivered')");
    });
  });

  describe("generateTableComment", () => {
    it("should produce inline COMMENT syntax", () => {
      const result = dialect.generateTableComment("users", "email", "User email address");
      expect(result).toBe("COMMENT 'User email address'");
    });

    it("should escape single quotes", () => {
      const result = dialect.generateTableComment("users", "name", "User's display name");
      expect(result).toBe("COMMENT 'User\\'s display name'");
    });
  });

  describe("driver properties", () => {
    it("should expose mysql2 driver config", () => {
      expect(dialect.driverImport).toBe("mysql2/promise");
      expect(dialect.driverConnectionType).toBe("Pool");
      expect(dialect.tableOptions).toBe(" ENGINE=InnoDB");
    });
  });
});
