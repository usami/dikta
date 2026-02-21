import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { MigrationExecutor, MigrationChainConfig } from "../src/types.js";
import { migrateUp, migrateDown, getMigrationStatus, computeChecksum } from "../src/chain.js";

// ── Helpers ─────────────────────────────────────────────────

/** Wrap better-sqlite3 synchronous API as async MigrationExecutor. */
function createSQLiteExecutor(db: InstanceType<typeof Database>): MigrationExecutor {
  return {
    async execute(sql: string): Promise<void> {
      db.exec(sql);
    },
    async query<T>(sql: string): Promise<readonly T[]> {
      // Strip trailing semicolons for better-sqlite3 prepare()
      const trimmed = sql.replace(/;\s*$/, "");
      return db.prepare(trimmed).all() as T[];
    },
  };
}

function createMigrationDir(
  baseDir: string,
  version: string,
  name: string,
  opts?: { upSQL?: string; downSQL?: string },
): void {
  const dirName = `${version}_${name}`;
  const dirPath = join(baseDir, dirName);
  mkdirSync(dirPath, { recursive: true });

  writeFileSync(
    join(dirPath, "up.sql"),
    opts?.upSQL ?? `BEGIN;\nCREATE TABLE "${name}" ("id" TEXT NOT NULL PRIMARY KEY, "value" TEXT);\nCOMMIT;\n`,
  );
  writeFileSync(
    join(dirPath, "down.sql"),
    opts?.downSQL ?? `BEGIN;\nDROP TABLE IF EXISTS "${name}";\nCOMMIT;\n`,
  );
  writeFileSync(join(dirPath, "verify.sql"), `SELECT 1;\n`);
  writeFileSync(
    join(dirPath, "metadata.json"),
    JSON.stringify({
      name,
      description: `Migration: ${name}`,
      timestamp: version,
      changes: [],
      safety: { level: "safe", risks: [], summary: "" },
      impact: { contracts: [], indexRecommendations: [], backfillRequirements: [] },
    }, null, 2),
  );
}

// ── Tests ───────────────────────────────────────────────────

describe("chain integration with better-sqlite3", () => {
  let db: InstanceType<typeof Database>;
  let executor: MigrationExecutor;
  let tempDir: string;
  let migrationsDir: string;
  let config: MigrationChainConfig;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    executor = createSQLiteExecutor(db);

    tempDir = mkdtempSync(join(tmpdir(), "dikta-chain-int-"));
    migrationsDir = join(tempDir, "migrations");
    mkdirSync(migrationsDir);

    config = {
      migrationsDir,
      target: "sqlite",
      tableName: "dikta_migrations",
    };
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("tracking table creation", () => {
    it("should create tracking table on first status check", async () => {
      const status = await getMigrationStatus(executor, config);

      expect(status.total).toBe(0);
      expect(status.applied).toBe(0);
      expect(status.pending).toBe(0);

      // Verify the tracking table exists
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .all("dikta_migrations") as { name: string }[];
      expect(tables).toHaveLength(1);
    });

    it("should use custom table name", async () => {
      const customConfig = { ...config, tableName: "custom_migrations" };
      await getMigrationStatus(executor, customConfig);

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .all("custom_migrations") as { name: string }[];
      expect(tables).toHaveLength(1);
    });

    it("should not fail if tracking table already exists", async () => {
      await getMigrationStatus(executor, config);
      // Second call should not throw
      const status = await getMigrationStatus(executor, config);
      expect(status.total).toBe(0);
    });
  });

  describe("migrateUp", () => {
    it("should apply all pending migrations in order", async () => {
      createMigrationDir(migrationsDir, "20260101000000", "users");
      createMigrationDir(migrationsDir, "20260201000000", "orders");
      createMigrationDir(migrationsDir, "20260301000000", "products");

      const result = await migrateUp(executor, config);

      expect(result.applied).toHaveLength(3);
      expect(result.applied[0]).toEqual({ version: "20260101000000", name: "users" });
      expect(result.applied[1]).toEqual({ version: "20260201000000", name: "orders" });
      expect(result.applied[2]).toEqual({ version: "20260301000000", name: "products" });
      expect(result.errors).toHaveLength(0);

      // Verify tables were created
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as { name: string }[];
      const tableNames = tables.map((t) => t.name);
      expect(tableNames).toContain("users");
      expect(tableNames).toContain("orders");
      expect(tableNames).toContain("products");
    });

    it("should skip already applied migrations", async () => {
      createMigrationDir(migrationsDir, "20260101000000", "users");
      createMigrationDir(migrationsDir, "20260201000000", "orders");

      // Apply first migration
      await migrateUp(executor, config, { count: 1 });

      // Apply remaining
      const result = await migrateUp(executor, config);

      expect(result.applied).toHaveLength(1);
      expect(result.applied[0]).toEqual({ version: "20260201000000", name: "orders" });
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0]).toEqual({ version: "20260101000000", name: "users" });
    });

    it("should respect count option", async () => {
      createMigrationDir(migrationsDir, "20260101000000", "users");
      createMigrationDir(migrationsDir, "20260201000000", "orders");
      createMigrationDir(migrationsDir, "20260301000000", "products");

      const result = await migrateUp(executor, config, { count: 2 });

      expect(result.applied).toHaveLength(2);
      expect(result.applied[0]!.version).toBe("20260101000000");
      expect(result.applied[1]!.version).toBe("20260201000000");
    });

    it("should respect target option", async () => {
      createMigrationDir(migrationsDir, "20260101000000", "users");
      createMigrationDir(migrationsDir, "20260201000000", "orders");
      createMigrationDir(migrationsDir, "20260301000000", "products");

      const result = await migrateUp(executor, config, { target: "20260201000000" });

      expect(result.applied).toHaveLength(2);
      expect(result.applied[0]!.version).toBe("20260101000000");
      expect(result.applied[1]!.version).toBe("20260201000000");
    });

    it("should return error for non-existent target version", async () => {
      createMigrationDir(migrationsDir, "20260101000000", "users");

      const result = await migrateUp(executor, config, { target: "99999999999999" });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.message).toContain("not found or not pending");
    });

    it("should stop on first SQL error", async () => {
      createMigrationDir(migrationsDir, "20260101000000", "users");
      createMigrationDir(migrationsDir, "20260201000000", "bad_migration", {
        upSQL: "BEGIN;\nINVALID SQL SYNTAX HERE;\nCOMMIT;\n",
      });
      createMigrationDir(migrationsDir, "20260301000000", "products");

      const result = await migrateUp(executor, config);

      expect(result.applied).toHaveLength(1);
      expect(result.applied[0]!.version).toBe("20260101000000");
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.version).toBe("20260201000000");
      expect(result.errors[0]!.message).toBeTruthy();
    });

    it("should store checksum in tracking table", async () => {
      const upSQL = `BEGIN;\nCREATE TABLE "users" ("id" TEXT NOT NULL PRIMARY KEY);\nCOMMIT;\n`;
      createMigrationDir(migrationsDir, "20260101000000", "users", { upSQL });

      await migrateUp(executor, config);

      const records = db
        .prepare('SELECT "version", "checksum" FROM "dikta_migrations"')
        .all() as { version: string; checksum: string }[];

      expect(records).toHaveLength(1);
      expect(records[0]!.checksum).toBe(computeChecksum(upSQL));
    });

    it("should record applied_at timestamp", async () => {
      createMigrationDir(migrationsDir, "20260101000000", "users");

      await migrateUp(executor, config);

      const records = db
        .prepare('SELECT "applied_at" FROM "dikta_migrations"')
        .all() as { applied_at: string }[];

      expect(records).toHaveLength(1);
      expect(records[0]!.applied_at).toBeTruthy();
    });

    it("should return empty result when all migrations already applied", async () => {
      createMigrationDir(migrationsDir, "20260101000000", "users");
      await migrateUp(executor, config);

      const result = await migrateUp(executor, config);

      expect(result.applied).toHaveLength(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("migrateDown", () => {
    it("should roll back the last applied migration by default", async () => {
      createMigrationDir(migrationsDir, "20260101000000", "users");
      createMigrationDir(migrationsDir, "20260201000000", "orders");
      await migrateUp(executor, config);

      const result = await migrateDown(executor, config);

      expect(result.applied).toHaveLength(1);
      expect(result.applied[0]).toEqual({ version: "20260201000000", name: "orders" });

      // Verify orders table was dropped
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='orders'")
        .all();
      expect(tables).toHaveLength(0);

      // Verify users table still exists
      const usersTables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
        .all();
      expect(usersTables).toHaveLength(1);
    });

    it("should respect count option", async () => {
      createMigrationDir(migrationsDir, "20260101000000", "users");
      createMigrationDir(migrationsDir, "20260201000000", "orders");
      createMigrationDir(migrationsDir, "20260301000000", "products");
      await migrateUp(executor, config);

      const result = await migrateDown(executor, config, { count: 2 });

      expect(result.applied).toHaveLength(2);
      expect(result.applied[0]!.version).toBe("20260301000000");
      expect(result.applied[1]!.version).toBe("20260201000000");

      // Only users should remain
      const status = await getMigrationStatus(executor, config);
      expect(status.applied).toBe(1);
      expect(status.entries[0]!.status).toBe("applied");
      expect(status.entries[0]!.version).toBe("20260101000000");
    });

    it("should respect target option (target stays applied)", async () => {
      createMigrationDir(migrationsDir, "20260101000000", "users");
      createMigrationDir(migrationsDir, "20260201000000", "orders");
      createMigrationDir(migrationsDir, "20260301000000", "products");
      await migrateUp(executor, config);

      const result = await migrateDown(executor, config, { target: "20260201000000" });

      expect(result.applied).toHaveLength(1);
      expect(result.applied[0]!.version).toBe("20260301000000");

      // Users and orders should still be applied
      const status = await getMigrationStatus(executor, config);
      expect(status.applied).toBe(2);
    });

    it("should return error for non-existent target version", async () => {
      createMigrationDir(migrationsDir, "20260101000000", "users");
      await migrateUp(executor, config);

      const result = await migrateDown(executor, config, { target: "99999999999999" });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.message).toContain("not found or not applied");
    });

    it("should stop on first SQL error during rollback", async () => {
      createMigrationDir(migrationsDir, "20260101000000", "users");
      createMigrationDir(migrationsDir, "20260201000000", "orders");
      createMigrationDir(migrationsDir, "20260301000000", "bad_rollback", {
        downSQL: "BEGIN;\nINVALID SQL;\nCOMMIT;\n",
      });
      await migrateUp(executor, config);

      const result = await migrateDown(executor, config, { count: 3 });

      // Should fail on the first rollback attempt (bad_rollback is latest)
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.version).toBe("20260301000000");
      expect(result.applied).toHaveLength(0);
    });

    it("should remove tracking record on successful rollback", async () => {
      createMigrationDir(migrationsDir, "20260101000000", "users");
      await migrateUp(executor, config);

      const beforeRecords = db
        .prepare('SELECT COUNT(*) as cnt FROM "dikta_migrations"')
        .get() as { cnt: number };
      expect(beforeRecords.cnt).toBe(1);

      await migrateDown(executor, config);

      const afterRecords = db
        .prepare('SELECT COUNT(*) as cnt FROM "dikta_migrations"')
        .get() as { cnt: number };
      expect(afterRecords.cnt).toBe(0);
    });

    it("should return empty when no migrations are applied", async () => {
      createMigrationDir(migrationsDir, "20260101000000", "users");

      const result = await migrateDown(executor, config);

      expect(result.applied).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("getMigrationStatus", () => {
    it("should report all pending when none applied", async () => {
      createMigrationDir(migrationsDir, "20260101000000", "users");
      createMigrationDir(migrationsDir, "20260201000000", "orders");

      const status = await getMigrationStatus(executor, config);

      expect(status.total).toBe(2);
      expect(status.applied).toBe(0);
      expect(status.pending).toBe(2);
      expect(status.entries[0]!.status).toBe("pending");
      expect(status.entries[1]!.status).toBe("pending");
    });

    it("should report mixed status after partial migration", async () => {
      createMigrationDir(migrationsDir, "20260101000000", "users");
      createMigrationDir(migrationsDir, "20260201000000", "orders");
      await migrateUp(executor, config, { count: 1 });

      const status = await getMigrationStatus(executor, config);

      expect(status.total).toBe(2);
      expect(status.applied).toBe(1);
      expect(status.pending).toBe(1);
      expect(status.entries[0]!.status).toBe("applied");
      expect(status.entries[0]!.appliedAt).toBeTruthy();
      expect(status.entries[1]!.status).toBe("pending");
    });

    it("should report all applied after full migration", async () => {
      createMigrationDir(migrationsDir, "20260101000000", "users");
      createMigrationDir(migrationsDir, "20260201000000", "orders");
      await migrateUp(executor, config);

      const status = await getMigrationStatus(executor, config);

      expect(status.total).toBe(2);
      expect(status.applied).toBe(2);
      expect(status.pending).toBe(0);
    });

    it("should detect checksum mismatch", async () => {
      const upSQL = `BEGIN;\nCREATE TABLE "users" ("id" TEXT NOT NULL PRIMARY KEY);\nCOMMIT;\n`;
      createMigrationDir(migrationsDir, "20260101000000", "users", { upSQL });
      await migrateUp(executor, config);

      // Modify the up.sql file after it was applied
      const upPath = join(migrationsDir, "20260101000000_users", "up.sql");
      writeFileSync(upPath, upSQL + "\n-- modified after apply");

      const status = await getMigrationStatus(executor, config);

      expect(status.entries[0]!.checksumMismatch).toBe(true);
    });

    it("should not flag checksum mismatch when content is unchanged", async () => {
      createMigrationDir(migrationsDir, "20260101000000", "users");
      await migrateUp(executor, config);

      const status = await getMigrationStatus(executor, config);

      expect(status.entries[0]!.checksumMismatch).toBeFalsy();
    });

    it("should report entries in version order", async () => {
      createMigrationDir(migrationsDir, "20260301000000", "products");
      createMigrationDir(migrationsDir, "20260101000000", "users");
      createMigrationDir(migrationsDir, "20260201000000", "orders");

      const status = await getMigrationStatus(executor, config);

      expect(status.entries[0]!.version).toBe("20260101000000");
      expect(status.entries[1]!.version).toBe("20260201000000");
      expect(status.entries[2]!.version).toBe("20260301000000");
    });
  });

  describe("up/down roundtrip", () => {
    it("should support full up then full down", async () => {
      createMigrationDir(migrationsDir, "20260101000000", "users");
      createMigrationDir(migrationsDir, "20260201000000", "orders");

      await migrateUp(executor, config);
      let status = await getMigrationStatus(executor, config);
      expect(status.applied).toBe(2);

      await migrateDown(executor, config, { count: 2 });
      status = await getMigrationStatus(executor, config);
      expect(status.applied).toBe(0);
      expect(status.pending).toBe(2);
    });

    it("should re-apply after rollback", async () => {
      createMigrationDir(migrationsDir, "20260101000000", "users");
      await migrateUp(executor, config);
      await migrateDown(executor, config);

      // Re-apply
      const result = await migrateUp(executor, config);
      expect(result.applied).toHaveLength(1);

      // Table should exist again
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
        .all();
      expect(tables).toHaveLength(1);
    });
  });
});
