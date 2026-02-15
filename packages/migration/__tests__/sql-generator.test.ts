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
  const safety = evaluateSafety(changes);
  return generateMigrationFiles(migration, EMPTY_IMPACT, safety);
}

describe("generateMigrationFiles", () => {
  describe("up.sql", () => {
    it("should generate CREATE TABLE for add_entity", () => {
      const files = makeFiles([
        addEntity("User", {
          id: { kind: "uuid", role: "identifier" },
          name: { kind: "string" },
          email: { kind: "string", nullable: true },
        }),
      ]);

      expect(files.up).toContain('CREATE TABLE "user"');
      expect(files.up).toContain('"id" UUID NOT NULL PRIMARY KEY');
      expect(files.up).toContain('"name" TEXT NOT NULL');
      expect(files.up).toContain('"email" TEXT');
      expect(files.up).toContain("BEGIN;");
      expect(files.up).toContain("COMMIT;");
    });

    it("should generate DROP TABLE for remove_entity", () => {
      const files = makeFiles([removeEntity("OldTable")]);
      expect(files.up).toContain('DROP TABLE IF EXISTS "old_table" CASCADE;');
    });

    it("should generate ALTER TABLE RENAME for rename_entity", () => {
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

    it("should generate three-step ADD COLUMN for add_field with backfill", () => {
      const files = makeFiles([
        addField("User", "role", { kind: "string" }, { backfill: "'user'" }),
      ]);
      expect(files.up).toContain("Step 1: Add column as nullable");
      expect(files.up).toContain("Step 2: Backfill existing rows");
      expect(files.up).toContain(`SET "role" = 'user'`);
      expect(files.up).toContain("Step 3: Set NOT NULL constraint");
      expect(files.up).toContain("SET NOT NULL");
    });

    it("should generate CHECK constraint for enum fields", () => {
      const files = makeFiles([
        addField("Order", "status", {
          kind: "enum",
          values: ["pending", "shipped"],
        }),
      ]);
      expect(files.up).toContain("chk_order_status");
      expect(files.up).toContain("'pending', 'shipped'");
    });

    it("should generate FK constraint for ref fields", () => {
      const files = makeFiles([
        addField("Order", "customer_id", {
          kind: "ref",
          entity: "Customer",
          cascade: "cascade",
        }),
      ]);
      expect(files.up).toContain("fk_order_customer_id");
      expect(files.up).toContain('REFERENCES "customer"');
      expect(files.up).toContain("ON DELETE CASCADE");
    });

    it("should generate DROP COLUMN for remove_field", () => {
      const files = makeFiles([removeField("User", "legacyCol")]);
      expect(files.up).toContain('DROP COLUMN IF EXISTS "legacy_col"');
    });

    it("should generate RENAME COLUMN for rename_field", () => {
      const files = makeFiles([renameField("User", "oldName", "newName")]);
      expect(files.up).toContain('RENAME COLUMN "old_name" TO "new_name"');
    });

    it("should generate ALTER COLUMN for alter_field nullable change", () => {
      const files = makeFiles([
        alterField("User", "email", {
          nullable: { from: true, to: false },
        }),
      ]);
      expect(files.up).toContain("SET NOT NULL");
    });

    it("should generate ALTER COLUMN for alter_field drop NOT NULL", () => {
      const files = makeFiles([
        alterField("User", "email", {
          nullable: { from: false, to: true },
        }),
      ]);
      expect(files.up).toContain("DROP NOT NULL");
    });

    it("should generate comment for invariant changes", () => {
      const files = makeFiles([addInvariant("Order", "total >= 0")]);
      expect(files.up).toContain("Application invariant added: total >= 0");
    });
  });

  describe("down.sql", () => {
    it("should generate DROP TABLE for added entity", () => {
      const files = makeFiles([
        addEntity("User", { id: { kind: "uuid", role: "identifier" } }),
      ]);
      expect(files.down).toContain('DROP TABLE IF EXISTS "user" CASCADE;');
    });

    it("should include warning for removed entity", () => {
      const files = makeFiles([removeEntity("OldTable")]);
      expect(files.down).toContain("WARNING: Cannot fully reverse DROP TABLE");
    });

    it("should reverse rename_entity", () => {
      const files = makeFiles([renameEntity("Old", "New")]);
      expect(files.down).toContain('RENAME TO "old"');
    });

    it("should reverse add_field with DROP COLUMN", () => {
      const files = makeFiles([
        addField("User", "bio", { kind: "string", nullable: true }),
      ]);
      expect(files.down).toContain('DROP COLUMN IF EXISTS "bio"');
    });

    it("should include warning for removed field", () => {
      const files = makeFiles([removeField("User", "legacy")]);
      expect(files.down).toContain("WARNING: Cannot reverse DROP COLUMN");
    });

    it("should reverse operations in reverse order", () => {
      const files = makeFiles([
        addField("User", "a", { kind: "string", nullable: true }),
        addField("User", "b", { kind: "string", nullable: true }),
      ]);
      const aIdx = files.down.indexOf('"a"');
      const bIdx = files.down.indexOf('"b"');
      // b was added second, so it should be dropped first in down
      expect(bIdx).toBeLessThan(aIdx);
    });
  });

  describe("verify.sql", () => {
    it("should verify table existence for add_entity", () => {
      const files = makeFiles([
        addEntity("User", { id: { kind: "uuid", role: "identifier" } }),
      ]);
      expect(files.verify).toContain("information_schema.tables");
      expect(files.verify).toContain("user");
      expect(files.verify).toContain("user_exists");
    });

    it("should verify column existence for add_field", () => {
      const files = makeFiles([
        addField("User", "email", { kind: "string", nullable: true }),
      ]);
      expect(files.verify).toContain("information_schema.columns");
      expect(files.verify).toContain("email");
    });

    it("should verify column removal for remove_field", () => {
      const files = makeFiles([removeField("User", "legacy")]);
      expect(files.verify).toContain("NOT EXISTS");
      expect(files.verify).toContain("removed");
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

describe("generateMigrationDirectory", () => {
  it("should produce GeneratedFile[] with correct paths", () => {
    const migration = defineMigration("add_user_email", {
      changes: [addField("User", "email", { kind: "string", nullable: true })],
      timestamp: "2026-01-15T00:00:00.000Z",
    });
    const safety = evaluateSafety(migration.config.changes as SchemaChange[]);
    const generatedFiles = generateMigrationDirectory(migration, EMPTY_IMPACT, safety);

    expect(generatedFiles).toHaveLength(4);

    const paths = generatedFiles.map((f) => f.path);
    expect(paths.some((p) => p.endsWith("/up.sql"))).toBe(true);
    expect(paths.some((p) => p.endsWith("/down.sql"))).toBe(true);
    expect(paths.some((p) => p.endsWith("/verify.sql"))).toBe(true);
    expect(paths.some((p) => p.endsWith("/metadata.json"))).toBe(true);

    // Path should start with migrations/
    expect(paths[0]).toMatch(/^migrations\//);
    expect(paths[0]).toContain("add_user_email");
  });

  it("should produce valid JSON in metadata.json", () => {
    const migration = defineMigration("test", {
      changes: [addField("User", "x", { kind: "string", nullable: true })],
      timestamp: "2026-01-15T00:00:00.000Z",
    });
    const safety = evaluateSafety(migration.config.changes as SchemaChange[]);
    const generatedFiles = generateMigrationDirectory(migration, EMPTY_IMPACT, safety);

    const metadataFile = generatedFiles.find((f) => f.path.endsWith("/metadata.json"))!;
    const parsed = JSON.parse(metadataFile.content);
    expect(parsed.name).toBe("test");
  });
});
