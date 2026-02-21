import { describe, it, expect } from "vitest";
import { createPostgreSQLDialect } from "../src/targets/postgresql/dialect.js";
import type { SQLDialect } from "../src/types.js";

describe("PostgreSQLDialect", () => {
  const dialect: SQLDialect = createPostgreSQLDialect();

  it("should report target as postgresql", () => {
    expect(dialect.target).toBe("postgresql");
  });

  describe("quoteIdentifier", () => {
    it("should use double quotes", () => {
      expect(dialect.quoteIdentifier("users")).toBe('"users"');
      expect(dialect.quoteIdentifier("order_items")).toBe('"order_items"');
    });
  });

  describe("fieldKindToSQLType", () => {
    it("should map basic kinds", () => {
      expect(dialect.fieldKindToSQLType("uuid", "identifier")).toBe("UUID");
      expect(dialect.fieldKindToSQLType("string", "general")).toBe("TEXT");
      expect(dialect.fieldKindToSQLType("integer", "general")).toBe("INTEGER");
      expect(dialect.fieldKindToSQLType("boolean", "general")).toBe("BOOLEAN");
      expect(dialect.fieldKindToSQLType("timestamp", "audit_timestamp")).toBe("TIMESTAMPTZ");
    });

    it("should apply monetary override for decimal", () => {
      expect(dialect.fieldKindToSQLType("decimal", "monetary")).toBe("NUMERIC(19,4)");
      expect(dialect.fieldKindToSQLType("decimal", "general")).toBe("NUMERIC");
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
    it("should produce positional $N placeholders", () => {
      expect(dialect.parameterPlaceholder(1)).toBe("$1");
      expect(dialect.parameterPlaceholder(2)).toBe("$2");
      expect(dialect.parameterPlaceholder(10)).toBe("$10");
    });
  });

  describe("generateEnumConstraint", () => {
    it("should produce CHECK constraint", () => {
      const result = dialect.generateEnumConstraint("orders", "status", [
        "pending",
        "shipped",
        "delivered",
      ]);
      expect(result).toBe(
        `CONSTRAINT "chk_orders_status" CHECK ("status" IN ('pending', 'shipped', 'delivered'))`,
      );
    });
  });

  describe("generateTableComment", () => {
    it("should produce COMMENT ON syntax", () => {
      const result = dialect.generateTableComment("users", "email", "User email address");
      expect(result).toBe(
        `COMMENT ON COLUMN "users"."email" IS 'User email address';`,
      );
    });

    it("should escape single quotes", () => {
      const result = dialect.generateTableComment("users", "name", "User's display name");
      expect(result).toBe(
        `COMMENT ON COLUMN "users"."name" IS 'User''s display name';`,
      );
    });
  });

  describe("driver properties", () => {
    it("should expose postgres driver config", () => {
      expect(dialect.driverImport).toBe("postgres");
      expect(dialect.driverConnectionType).toBe("Sql");
      expect(dialect.tableOptions).toBe("");
    });
  });
});
