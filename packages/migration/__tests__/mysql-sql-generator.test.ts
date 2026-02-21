import { describe, it, expect } from "vitest";
import {
  defineMigration,
  addEntity,
  removeEntity,
  renameEntity,
  addField,
  removeField,
  renameField,
  alterField,
  addInvariant,
} from "../src/definition.js";
import { evaluateSafety } from "../src/safety.js";
import {
  generateMigrationFiles,
  generateMigrationDirectory,
} from "../src/sql-generator.js";
import type { MigrationImpact, SchemaChange } from "../src/types.js";

const EMPTY_IMPACT: MigrationImpact = {
  contracts: [],
  indexRecommendations: [],
  backfillRequirements: [],
};

function makeFiles(changes: SchemaChange[]) {
  const migration = defineMigration("test_migration", {
    changes,
    timestamp: "2026-01-15T00:00:00.000Z",
  });
  const safety = evaluateSafety(changes, "mysql");
  return generateMigrationFiles(migration, EMPTY_IMPACT, safety, undefined, "mysql");
}

describe("generateMigrationFiles (MySQL)", () => {
  describe("up.sql", () => {
    it("should generate CREATE TABLE with backtick quoting and ENGINE=InnoDB", () => {
      const files = makeFiles([
        addEntity("User", {
          id: { kind: "uuid", role: "identifier" },
          name: { kind: "string" },
          email: { kind: "string", nullable: true },
        }),
      ]);

      expect(files.up).toContain("CREATE TABLE `user`");
      expect(files.up).toContain("`id` CHAR(36) NOT NULL PRIMARY KEY");
      expect(files.up).toContain("`name` VARCHAR(255) NOT NULL");
      expect(files.up).toContain("`email` VARCHAR(255)");
      expect(files.up).toContain("ENGINE=InnoDB");
      expect(files.up).toContain("BEGIN;");
      expect(files.up).toContain("COMMIT;");
    });

    it("should generate DROP TABLE without CASCADE", () => {
      const files = makeFiles([removeEntity("OldTable")]);
      expect(files.up).toContain("DROP TABLE IF EXISTS `old_table`;");
      expect(files.up).not.toContain("CASCADE");
    });

    it("should generate ALTER TABLE RENAME with backtick quoting", () => {
      const files = makeFiles([renameEntity("OldName", "NewName")]);
      expect(files.up).toContain("ALTER TABLE `old_name` RENAME TO `new_name`");
    });

    it("should generate ADD COLUMN for add_field (nullable)", () => {
      const files = makeFiles([
        addField("User", "bio", { kind: "string", nullable: true }),
      ]);
      expect(files.up).toContain("ADD COLUMN `bio` VARCHAR(255)");
      expect(files.up).not.toContain("NOT NULL");
    });

    it("should generate three-step ADD COLUMN with MODIFY COLUMN for backfill", () => {
      const files = makeFiles([
        addField("User", "role", { kind: "string" }, { backfill: "'user'" }),
      ]);
      expect(files.up).toContain("Step 1: Add column as nullable");
      expect(files.up).toContain("ADD COLUMN `role` VARCHAR(255)");
      expect(files.up).toContain("Step 2: Backfill existing rows");
      expect(files.up).toContain("SET `role` = 'user'");
      expect(files.up).toContain("Step 3: Set NOT NULL constraint");
      expect(files.up).toContain("MODIFY COLUMN `role` VARCHAR(255) NOT NULL");
    });

    it("should use native ENUM type for enum fields without CHECK constraint", () => {
      const files = makeFiles([
        addField("Order", "status", {
          kind: "enum",
          values: ["pending", "shipped"],
        }),
      ]);
      expect(files.up).toContain("ENUM('pending', 'shipped')");
      // MySQL should NOT have CHECK constraints for enums
      expect(files.up).not.toContain("chk_");
      expect(files.up).not.toContain("CHECK");
    });

    it("should generate native ENUM in CREATE TABLE", () => {
      const files = makeFiles([
        addEntity("Order", {
          id: { kind: "uuid", role: "identifier" },
          status: { kind: "enum", values: ["pending", "shipped", "delivered"] },
        }),
      ]);
      expect(files.up).toContain("ENUM('pending', 'shipped', 'delivered')");
      expect(files.up).not.toContain("CHECK");
      expect(files.up).toContain("ENGINE=InnoDB");
    });

    it("should generate FK constraint with backtick quoting", () => {
      const files = makeFiles([
        addField("Order", "customer_id", {
          kind: "ref",
          entity: "Customer",
          cascade: "cascade",
        }),
      ]);
      expect(files.up).toContain("`fk_order_customer_id`");
      expect(files.up).toContain("REFERENCES `customer`");
      expect(files.up).toContain("ON DELETE CASCADE");
    });

    it("should generate DROP COLUMN with backtick quoting", () => {
      const files = makeFiles([removeField("User", "legacyCol")]);
      expect(files.up).toContain("DROP COLUMN IF EXISTS `legacy_col`");
    });

    it("should generate RENAME COLUMN with backtick quoting", () => {
      const files = makeFiles([renameField("User", "oldName", "newName")]);
      expect(files.up).toContain("RENAME COLUMN `old_name` TO `new_name`");
    });

    it("should generate MODIFY COLUMN for alter_field nullable change", () => {
      const files = makeFiles([
        alterField("User", "email", {
          nullable: { from: true, to: false },
        }, { currentKind: "string", currentRole: "general" }),
      ]);
      expect(files.up).toContain("MODIFY COLUMN `email` VARCHAR(255) NOT NULL");
    });

    it("should generate MODIFY COLUMN for alter_field drop NOT NULL", () => {
      const files = makeFiles([
        alterField("User", "email", {
          nullable: { from: false, to: true },
        }, { currentKind: "string", currentRole: "general" }),
      ]);
      expect(files.up).toContain("MODIFY COLUMN `email` VARCHAR(255) NULL");
    });

    it("should generate MODIFY COLUMN for type change", () => {
      const files = makeFiles([
        alterField("User", "age", {
          kind: { from: "string", to: "integer" },
        }),
      ]);
      expect(files.up).toContain("MODIFY COLUMN `age` INT");
    });

    it("should use DROP FOREIGN KEY instead of DROP CONSTRAINT for cascade change", () => {
      const files = makeFiles([
        alterField("Order", "customer_id", {
          cascade: { from: "restrict", to: "cascade" },
        }),
      ]);
      expect(files.up).toContain("DROP FOREIGN KEY `fk_order_customer_id`");
    });

    it("should generate comment for invariant changes", () => {
      const files = makeFiles([addInvariant("Order", "total >= 0")]);
      expect(files.up).toContain("Application invariant added: total >= 0");
    });
  });

  describe("down.sql", () => {
    it("should generate DROP TABLE without CASCADE for added entity", () => {
      const files = makeFiles([
        addEntity("User", { id: { kind: "uuid", role: "identifier" } }),
      ]);
      expect(files.down).toContain("DROP TABLE IF EXISTS `user`;");
      expect(files.down).not.toContain("CASCADE");
    });

    it("should include warning for removed entity", () => {
      const files = makeFiles([removeEntity("OldTable")]);
      expect(files.down).toContain("WARNING: Cannot fully reverse DROP TABLE");
    });

    it("should reverse rename_entity with backtick quoting", () => {
      const files = makeFiles([renameEntity("Old", "New")]);
      expect(files.down).toContain("RENAME TO `old`");
    });

    it("should reverse add_field with DROP COLUMN", () => {
      const files = makeFiles([
        addField("User", "bio", { kind: "string", nullable: true }),
      ]);
      expect(files.down).toContain("DROP COLUMN IF EXISTS `bio`");
    });

    it("should reverse operations in reverse order", () => {
      const files = makeFiles([
        addField("User", "a", { kind: "string", nullable: true }),
        addField("User", "b", { kind: "string", nullable: true }),
      ]);
      const aIdx = files.down.indexOf("`a`");
      const bIdx = files.down.indexOf("`b`");
      expect(bIdx).toBeLessThan(aIdx);
    });

    it("should use MODIFY COLUMN for reverse alter", () => {
      const files = makeFiles([
        alterField("User", "email", {
          kind: { from: "string", to: "integer" },
        }),
      ]);
      expect(files.down).toContain("MODIFY COLUMN `email` VARCHAR(255)");
    });
  });

  describe("verify.sql", () => {
    it("should verify table existence with table_schema = DATABASE()", () => {
      const files = makeFiles([
        addEntity("User", { id: { kind: "uuid", role: "identifier" } }),
      ]);
      expect(files.verify).toContain("information_schema.tables");
      expect(files.verify).toContain("table_schema = DATABASE()");
      expect(files.verify).toContain("`user_exists`");
    });

    it("should verify column existence with table_schema = DATABASE()", () => {
      const files = makeFiles([
        addField("User", "email", { kind: "string", nullable: true }),
      ]);
      expect(files.verify).toContain("information_schema.columns");
      expect(files.verify).toContain("table_schema = DATABASE()");
    });

    it("should verify column removal with table_schema = DATABASE()", () => {
      const files = makeFiles([removeField("User", "legacy")]);
      expect(files.verify).toContain("NOT EXISTS");
      expect(files.verify).toContain("table_schema = DATABASE()");
    });

    it("should verify column details with table_schema = DATABASE()", () => {
      const files = makeFiles([
        alterField("User", "email", {
          nullable: { from: true, to: false },
        }),
      ]);
      expect(files.verify).toContain("column_name, data_type, is_nullable");
      expect(files.verify).toContain("table_schema = DATABASE()");
    });
  });

  describe("metadata", () => {
    it("should include all metadata fields", () => {
      const changes = [addField("User", "bio", { kind: "string", nullable: true })];
      const files = makeFiles(changes);

      expect(files.metadata.name).toBe("test_migration");
      expect(files.metadata.timestamp).toBe("2026-01-15T00:00:00.000Z");
      expect(files.metadata.changes).toHaveLength(1);
      expect(files.metadata.safety.level).toBe("safe");
    });
  });
});

describe("generateMigrationDirectory (MySQL)", () => {
  it("should produce GeneratedFile[] with correct paths", () => {
    const migration = defineMigration("add_user_email", {
      changes: [addField("User", "email", { kind: "string", nullable: true })],
      timestamp: "2026-01-15T00:00:00.000Z",
    });
    const safety = evaluateSafety(migration.config.changes as SchemaChange[], "mysql");
    const generatedFiles = generateMigrationDirectory(
      migration, EMPTY_IMPACT, safety, undefined, "mysql",
    );

    expect(generatedFiles).toHaveLength(4);

    const paths = generatedFiles.map((f) => f.path);
    expect(paths.some((p) => p.endsWith("/up.sql"))).toBe(true);
    expect(paths.some((p) => p.endsWith("/down.sql"))).toBe(true);
    expect(paths.some((p) => p.endsWith("/verify.sql"))).toBe(true);
    expect(paths.some((p) => p.endsWith("/metadata.json"))).toBe(true);

    expect(paths[0]).toMatch(/^migrations\//);
    expect(paths[0]).toContain("add_user_email");
  });
});
