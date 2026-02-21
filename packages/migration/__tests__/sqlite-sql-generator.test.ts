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
  const safety = evaluateSafety(changes, "sqlite");
  return generateMigrationFiles(migration, EMPTY_IMPACT, safety, undefined, "sqlite");
}

describe("generateMigrationFiles (SQLite)", () => {
  describe("up.sql", () => {
    it("should generate CREATE TABLE with double-quote quoting", () => {
      const files = makeFiles([
        addEntity("User", {
          id: { kind: "uuid", role: "identifier" },
          name: { kind: "string" },
          email: { kind: "string", nullable: true },
        }),
      ]);

      expect(files.up).toContain('CREATE TABLE "user"');
      expect(files.up).toContain('"id" TEXT NOT NULL PRIMARY KEY');
      expect(files.up).toContain('"name" TEXT NOT NULL');
      expect(files.up).toContain('"email" TEXT');
      expect(files.up).toContain("BEGIN;");
      expect(files.up).toContain("COMMIT;");
    });

    it("should not include ENGINE=InnoDB or CASCADE on CREATE TABLE", () => {
      const files = makeFiles([
        addEntity("User", {
          id: { kind: "uuid", role: "identifier" },
        }),
      ]);

      expect(files.up).not.toContain("ENGINE=InnoDB");
      expect(files.up).not.toContain("CASCADE");
    });

    it("should generate DROP TABLE without CASCADE", () => {
      const files = makeFiles([removeEntity("OldTable")]);
      expect(files.up).toContain('DROP TABLE IF EXISTS "old_table";');
      expect(files.up).not.toContain("CASCADE");
    });

    it("should generate ALTER TABLE RENAME with double-quote quoting", () => {
      const files = makeFiles([renameEntity("OldName", "NewName")]);
      expect(files.up).toContain('ALTER TABLE "old_name" RENAME TO "new_name"');
    });

    it("should generate ADD COLUMN for add_field (nullable)", () => {
      const files = makeFiles([
        addField("User", "bio", { kind: "string", nullable: true }),
      ]);
      expect(files.up).toContain('ADD COLUMN "bio" TEXT');
      expect(files.up).not.toContain("NOT NULL");
    });

    it("should generate three-step ADD COLUMN with table rebuild comment for backfill", () => {
      const files = makeFiles([
        addField("User", "role", { kind: "string" }, { backfill: "'user'" }),
      ]);
      expect(files.up).toContain("Step 1: Add column as nullable");
      expect(files.up).toContain('ADD COLUMN "role" TEXT');
      expect(files.up).toContain("Step 2: Backfill existing rows");
      expect(files.up).toContain("SET \"role\" = 'user'");
      expect(files.up).toContain("Step 3: Set NOT NULL constraint");
      // SQLite can't ALTER COLUMN — table rebuild comment
      expect(files.up).toContain("table rebuild");
    });

    it("should use CHECK constraint for enum fields", () => {
      const files = makeFiles([
        addField("Order", "status", {
          kind: "enum",
          values: ["pending", "shipped"],
        }),
      ]);
      // SQLite uses CHECK constraints for enums, with table rebuild comment
      expect(files.up).toContain("table rebuild");
      expect(files.up).not.toContain("ENUM(");
    });

    it("should use CHECK constraint for enum in CREATE TABLE", () => {
      const files = makeFiles([
        addEntity("Order", {
          id: { kind: "uuid", role: "identifier" },
          status: { kind: "enum", values: ["pending", "shipped", "delivered"] },
        }),
      ]);
      expect(files.up).toContain("CHECK");
      expect(files.up).toContain("'pending'");
      expect(files.up).toContain("'shipped'");
      expect(files.up).toContain("'delivered'");
      expect(files.up).not.toContain("ENUM(");
    });

    it("should generate FK constraint with table rebuild comment for ref fields", () => {
      const files = makeFiles([
        addField("Order", "customer_id", {
          kind: "ref",
          entity: "Customer",
          cascade: "cascade",
        }),
      ]);
      // SQLite requires FK in CREATE TABLE definition
      expect(files.up).toContain("table rebuild");
      expect(files.up).toContain("FOREIGN KEY");
      expect(files.up).toContain('"customer"');
      expect(files.up).toContain("ON DELETE CASCADE");
    });

    it("should generate DROP COLUMN with double-quote quoting", () => {
      const files = makeFiles([removeField("User", "legacyCol")]);
      expect(files.up).toContain('DROP COLUMN "legacy_col"');
    });

    it("should generate RENAME COLUMN with double-quote quoting", () => {
      const files = makeFiles([renameField("User", "oldName", "newName")]);
      expect(files.up).toContain('RENAME COLUMN "old_name" TO "new_name"');
    });

    it("should generate table rebuild comment for alter_field nullable change", () => {
      const files = makeFiles([
        alterField("User", "email", {
          nullable: { from: true, to: false },
        }, { currentKind: "string", currentRole: "general" }),
      ]);
      // SQLite cannot ALTER COLUMN — requires table rebuild
      expect(files.up).toContain("SET NOT NULL");
      expect(files.up).toContain("table rebuild");
    });

    it("should generate table rebuild comment for alter_field drop NOT NULL", () => {
      const files = makeFiles([
        alterField("User", "email", {
          nullable: { from: false, to: true },
        }, { currentKind: "string", currentRole: "general" }),
      ]);
      expect(files.up).toContain("DROP NOT NULL");
      expect(files.up).toContain("table rebuild");
    });

    it("should generate table rebuild comment for type change", () => {
      const files = makeFiles([
        alterField("User", "age", {
          kind: { from: "string", to: "integer" },
        }),
      ]);
      expect(files.up).toContain("table rebuild");
      expect(files.up).not.toContain("MODIFY COLUMN");
    });

    it("should generate table rebuild comment for cascade change", () => {
      const files = makeFiles([
        alterField("Order", "customer_id", {
          cascade: { from: "restrict", to: "cascade" },
        }),
      ]);
      // SQLite requires table rebuild for FK changes
      expect(files.up).toContain("table rebuild");
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
      expect(files.down).toContain('DROP TABLE IF EXISTS "user";');
      expect(files.down).not.toContain("CASCADE");
    });

    it("should include warning for removed entity", () => {
      const files = makeFiles([removeEntity("OldTable")]);
      expect(files.down).toContain("WARNING: Cannot fully reverse DROP TABLE");
    });

    it("should reverse rename_entity with double-quote quoting", () => {
      const files = makeFiles([renameEntity("Old", "New")]);
      expect(files.down).toContain('RENAME TO "old"');
    });

    it("should reverse add_field with DROP COLUMN", () => {
      const files = makeFiles([
        addField("User", "bio", { kind: "string", nullable: true }),
      ]);
      expect(files.down).toContain('DROP COLUMN "bio"');
    });

    it("should reverse operations in reverse order", () => {
      const files = makeFiles([
        addField("User", "a", { kind: "string", nullable: true }),
        addField("User", "b", { kind: "string", nullable: true }),
      ]);
      const aIdx = files.down.indexOf('"a"');
      const bIdx = files.down.indexOf('"b"');
      expect(bIdx).toBeLessThan(aIdx);
    });
  });

  describe("verify.sql", () => {
    it("should verify table existence using sqlite_master", () => {
      const files = makeFiles([
        addEntity("User", { id: { kind: "uuid", role: "identifier" } }),
      ]);
      expect(files.verify).toContain("sqlite_master");
      expect(files.verify).toContain("user");
      expect(files.verify).toContain("user_exists");
    });

    it("should verify column existence using pragma_table_info", () => {
      const files = makeFiles([
        addField("User", "email", { kind: "string", nullable: true }),
      ]);
      expect(files.verify).toContain("pragma_table_info");
      expect(files.verify).toContain("email");
    });

    it("should verify column removal using pragma_table_info", () => {
      const files = makeFiles([removeField("User", "legacy")]);
      expect(files.verify).toContain("NOT EXISTS");
      expect(files.verify).toContain("pragma_table_info");
    });

    it("should not use information_schema (PG/MySQL only)", () => {
      const files = makeFiles([
        addEntity("User", { id: { kind: "uuid", role: "identifier" } }),
      ]);
      expect(files.verify).not.toContain("information_schema");
      expect(files.verify).not.toContain("table_schema");
    });

    it("should verify column details using pragma_table_info", () => {
      const files = makeFiles([
        alterField("User", "email", {
          nullable: { from: true, to: false },
        }),
      ]);
      expect(files.verify).toContain("pragma_table_info");
      expect(files.verify).toContain("name");
      expect(files.verify).toContain("type");
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

describe("generateMigrationDirectory (SQLite)", () => {
  it("should produce GeneratedFile[] with correct paths", () => {
    const migration = defineMigration("add_user_email", {
      changes: [addField("User", "email", { kind: "string", nullable: true })],
      timestamp: "2026-01-15T00:00:00.000Z",
    });
    const safety = evaluateSafety(migration.config.changes as SchemaChange[], "sqlite");
    const generatedFiles = generateMigrationDirectory(
      migration, EMPTY_IMPACT, safety, undefined, "sqlite",
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
