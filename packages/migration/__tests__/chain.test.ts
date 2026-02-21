import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { discoverMigrations, computeChecksum } from "../src/chain.js";

// ── Helpers ─────────────────────────────────────────────────

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function createMigrationDir(
  baseDir: string,
  version: string,
  name: string,
  opts?: { upSQL?: string; downSQL?: string; metadata?: object; skipUp?: boolean },
): string {
  const dirName = `${version}_${name}`;
  const dirPath = join(baseDir, dirName);
  mkdirSync(dirPath, { recursive: true });

  if (!opts?.skipUp) {
    writeFileSync(join(dirPath, "up.sql"), opts?.upSQL ?? `BEGIN;\nCREATE TABLE "${name}" ("id" TEXT PRIMARY KEY);\nCOMMIT;\n`);
  }
  writeFileSync(join(dirPath, "down.sql"), opts?.downSQL ?? `BEGIN;\nDROP TABLE IF EXISTS "${name}";\nCOMMIT;\n`);
  writeFileSync(join(dirPath, "verify.sql"), `SELECT 1;\n`);

  if (opts?.metadata) {
    writeFileSync(join(dirPath, "metadata.json"), JSON.stringify(opts.metadata, null, 2));
  } else {
    writeFileSync(join(dirPath, "metadata.json"), JSON.stringify({
      name,
      description: `Migration: ${name}`,
      timestamp: version,
      changes: [],
      safety: { level: "safe", risks: [], summary: "" },
      impact: { contracts: [], indexRecommendations: [], backfillRequirements: [] },
    }, null, 2));
  }

  return dirPath;
}

// ── Tests ───────────────────────────────────────────────────

describe("computeChecksum", () => {
  it("should compute SHA-256 hex digest", () => {
    const input = "BEGIN;\nCREATE TABLE test;\nCOMMIT;\n";
    expect(computeChecksum(input)).toBe(sha256(input));
  });

  it("should return 64-character hex string", () => {
    expect(computeChecksum("hello")).toHaveLength(64);
  });

  it("should produce different checksums for different inputs", () => {
    const a = computeChecksum("migration A");
    const b = computeChecksum("migration B");
    expect(a).not.toBe(b);
  });

  it("should produce same checksum for same input", () => {
    const input = "SELECT 1;";
    expect(computeChecksum(input)).toBe(computeChecksum(input));
  });
});

describe("discoverMigrations", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "dikta-chain-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should return empty array for non-existent directory", () => {
    const result = discoverMigrations(join(tempDir, "nonexistent"));
    expect(result).toEqual([]);
  });

  it("should return empty array for empty directory", () => {
    const dir = join(tempDir, "migrations");
    mkdirSync(dir);
    const result = discoverMigrations(dir);
    expect(result).toEqual([]);
  });

  it("should discover migrations sorted by version ASC", () => {
    const dir = join(tempDir, "migrations");
    mkdirSync(dir);

    createMigrationDir(dir, "20260201000000", "add_orders");
    createMigrationDir(dir, "20260101000000", "add_users");
    createMigrationDir(dir, "20260301000000", "add_products");

    const result = discoverMigrations(dir);

    expect(result).toHaveLength(3);
    expect(result[0]!.version).toBe("20260101000000");
    expect(result[0]!.name).toBe("add_users");
    expect(result[1]!.version).toBe("20260201000000");
    expect(result[1]!.name).toBe("add_orders");
    expect(result[2]!.version).toBe("20260301000000");
    expect(result[2]!.name).toBe("add_products");
  });

  it("should parse metadata.json", () => {
    const dir = join(tempDir, "migrations");
    mkdirSync(dir);

    createMigrationDir(dir, "20260101000000", "add_users", {
      metadata: {
        name: "add_users",
        description: "Create users table",
        timestamp: "20260101000000",
        changes: [{ kind: "add_entity", entity: "User", fields: {} }],
        safety: { level: "safe", risks: [], summary: "Safe migration" },
        impact: { contracts: [], indexRecommendations: [], backfillRequirements: [] },
      },
    });

    const result = discoverMigrations(dir);

    expect(result[0]!.metadata.description).toBe("Create users table");
    expect(result[0]!.metadata.changes).toHaveLength(1);
  });

  it("should read up.sql and down.sql content", () => {
    const dir = join(tempDir, "migrations");
    mkdirSync(dir);

    const upSQL = "BEGIN;\nCREATE TABLE users (id TEXT PRIMARY KEY);\nCOMMIT;\n";
    const downSQL = "BEGIN;\nDROP TABLE users;\nCOMMIT;\n";

    createMigrationDir(dir, "20260101000000", "add_users", { upSQL, downSQL });

    const result = discoverMigrations(dir);

    expect(result[0]!.upSQL).toBe(upSQL);
    expect(result[0]!.downSQL).toBe(downSQL);
  });

  it("should reject directories not matching pattern", () => {
    const dir = join(tempDir, "migrations");
    mkdirSync(dir);

    // Valid migration
    createMigrationDir(dir, "20260101000000", "add_users");

    // Invalid directories (should be ignored)
    mkdirSync(join(dir, "invalid_dir"));
    mkdirSync(join(dir, "123_short_version"));
    mkdirSync(join(dir, ".hidden"));

    const result = discoverMigrations(dir);

    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("add_users");
  });

  it("should ignore non-directory entries", () => {
    const dir = join(tempDir, "migrations");
    mkdirSync(dir);

    createMigrationDir(dir, "20260101000000", "add_users");
    writeFileSync(join(dir, "20260201000000_not_a_dir"), "file content");

    const result = discoverMigrations(dir);

    expect(result).toHaveLength(1);
  });

  it("should throw on duplicate versions", () => {
    const dir = join(tempDir, "migrations");
    mkdirSync(dir);

    createMigrationDir(dir, "20260101000000", "add_users");
    createMigrationDir(dir, "20260101000000", "add_orders");

    expect(() => discoverMigrations(dir)).toThrow(/Duplicate migration version/);
  });

  it("should throw when up.sql is missing", () => {
    const dir = join(tempDir, "migrations");
    mkdirSync(dir);

    createMigrationDir(dir, "20260101000000", "add_users", { skipUp: true });

    expect(() => discoverMigrations(dir)).toThrow(/missing up\.sql/);
  });

  it("should set dirPath correctly", () => {
    const dir = join(tempDir, "migrations");
    mkdirSync(dir);

    createMigrationDir(dir, "20260101000000", "add_users");

    const result = discoverMigrations(dir);
    expect(result[0]!.dirPath).toBe(join(dir, "20260101000000_add_users"));
  });
});
