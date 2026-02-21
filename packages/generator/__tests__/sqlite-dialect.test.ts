import { describe, it, expect } from "vitest";
import { createSQLiteDialect } from "../src/targets/sqlite/dialect.js";
import type { SQLDialect } from "../src/types.js";

describe("SQLiteDialect", () => {
  const dialect: SQLDialect = createSQLiteDialect();

  it("should report target as sqlite", () => {
    expect(dialect.target).toBe("sqlite");
  });

  describe("quoteIdentifier", () => {
    it("should use double quotes", () => {
      expect(dialect.quoteIdentifier("users")).toBe('"users"');
      expect(dialect.quoteIdentifier("order_items")).toBe('"order_items"');
    });
  });

  describe("fieldKindToSQLType", () => {
    it("should map uuid to TEXT", () => {
      expect(dialect.fieldKindToSQLType("uuid", "identifier")).toBe("TEXT");
    });

    it("should map string to TEXT", () => {
      expect(dialect.fieldKindToSQLType("string", "general")).toBe("TEXT");
      expect(dialect.fieldKindToSQLType("string", "display_name")).toBe("TEXT");
    });

    it("should map integer to INTEGER", () => {
      expect(dialect.fieldKindToSQLType("integer", "general")).toBe("INTEGER");
      expect(dialect.fieldKindToSQLType("integer", "quantity")).toBe("INTEGER");
    });

    it("should map boolean to INTEGER", () => {
      expect(dialect.fieldKindToSQLType("boolean", "general")).toBe("INTEGER");
    });

    it("should map timestamp to TEXT", () => {
      expect(dialect.fieldKindToSQLType("timestamp", "audit_timestamp")).toBe("TEXT");
    });

    it("should map decimal to REAL including monetary", () => {
      expect(dialect.fieldKindToSQLType("decimal", "general")).toBe("REAL");
      expect(dialect.fieldKindToSQLType("decimal", "monetary")).toBe("REAL");
    });

    it("should map enum to TEXT", () => {
      expect(dialect.fieldKindToSQLType("enum", "status")).toBe("TEXT");
    });

    it("should map ref to TEXT", () => {
      expect(dialect.fieldKindToSQLType("ref", "reference")).toBe("TEXT");
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
    it("should produce CHECK constraint with named CONSTRAINT", () => {
      const result = dialect.generateEnumConstraint("orders", "status", [
        "pending",
        "shipped",
        "delivered",
      ]);
      expect(result).toContain("CONSTRAINT");
      expect(result).toContain('"chk_orders_status"');
      expect(result).toContain("CHECK");
      expect(result).toContain("'pending'");
      expect(result).toContain("'shipped'");
      expect(result).toContain("'delivered'");
    });
  });

  describe("generateTableComment", () => {
    it("should produce SQL line comment", () => {
      const result = dialect.generateTableComment("users", "email", "User email address");
      expect(result).toBe("-- email: User email address");
    });

    it("should not produce COMMENT ON syntax", () => {
      const result = dialect.generateTableComment("users", "email", "PII");
      expect(result).not.toContain("COMMENT ON");
      expect(result).not.toContain("COMMENT '");
      expect(result).toMatch(/^--/);
    });
  });

  describe("driver properties", () => {
    it("should expose better-sqlite3 driver config", () => {
      expect(dialect.driverImport).toBe("better-sqlite3");
      expect(dialect.driverConnectionType).toBe("Database");
      expect(dialect.tableOptions).toBe("");
    });
  });
});
