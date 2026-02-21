import { describe, it, expect } from "vitest";
import { createChainDialect } from "../src/chain-dialect.js";

describe("createChainDialect", () => {
  describe("postgresql", () => {
    const dialect = createChainDialect("postgresql");

    it("should generate CREATE TABLE with TIMESTAMPTZ", () => {
      const sql = dialect.createTrackingTable("dikta_migrations");
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS "dikta_migrations"');
      expect(sql).toContain('"version" VARCHAR(14) NOT NULL PRIMARY KEY');
      expect(sql).toContain('"name" TEXT NOT NULL');
      expect(sql).toContain("TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP");
      expect(sql).toContain('"checksum" VARCHAR(64) NOT NULL');
    });

    it("should generate SELECT ordered by version ASC", () => {
      const sql = dialect.selectApplied("dikta_migrations");
      expect(sql).toContain('FROM "dikta_migrations"');
      expect(sql).toContain('ORDER BY "version" ASC');
    });

    it("should generate INSERT with version, name, checksum", () => {
      const sql = dialect.insertRecord("dikta_migrations", "20260101120000", "add_users", "abc123");
      expect(sql).toContain('INSERT INTO "dikta_migrations"');
      expect(sql).toContain("'20260101120000'");
      expect(sql).toContain("'add_users'");
      expect(sql).toContain("'abc123'");
    });

    it("should generate DELETE by version", () => {
      const sql = dialect.deleteRecord("dikta_migrations", "20260101120000");
      expect(sql).toContain('DELETE FROM "dikta_migrations"');
      expect(sql).toContain("'20260101120000'");
    });

    it("should use double-quote identifiers", () => {
      const sql = dialect.createTrackingTable("my_table");
      expect(sql).toContain('"my_table"');
      expect(sql).not.toContain("`");
    });
  });

  describe("mysql", () => {
    const dialect = createChainDialect("mysql");

    it("should generate CREATE TABLE with ENGINE=InnoDB", () => {
      const sql = dialect.createTrackingTable("dikta_migrations");
      expect(sql).toContain("CREATE TABLE IF NOT EXISTS `dikta_migrations`");
      expect(sql).toContain("ENGINE=InnoDB");
      expect(sql).toContain("TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)");
    });

    it("should use backtick identifiers", () => {
      const sql = dialect.selectApplied("dikta_migrations");
      expect(sql).toContain("`dikta_migrations`");
      expect(sql).toContain("`version`");
    });

    it("should generate INSERT with backtick identifiers", () => {
      const sql = dialect.insertRecord("dikta_migrations", "20260101120000", "add_users", "abc123");
      expect(sql).toContain("INSERT INTO `dikta_migrations`");
      expect(sql).toContain("`version`");
    });

    it("should generate DELETE with backtick identifiers", () => {
      const sql = dialect.deleteRecord("dikta_migrations", "20260101120000");
      expect(sql).toContain("DELETE FROM `dikta_migrations`");
      expect(sql).toContain("`version`");
    });
  });

  describe("sqlite", () => {
    const dialect = createChainDialect("sqlite");

    it("should generate CREATE TABLE with TEXT types", () => {
      const sql = dialect.createTrackingTable("dikta_migrations");
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS "dikta_migrations"');
      expect(sql).toContain('"version" TEXT NOT NULL PRIMARY KEY');
      expect(sql).toContain('"name" TEXT NOT NULL');
      expect(sql).toContain("datetime('now')");
      expect(sql).toContain('"checksum" TEXT NOT NULL');
    });

    it("should generate SELECT with double-quote identifiers", () => {
      const sql = dialect.selectApplied("dikta_migrations");
      expect(sql).toContain('"dikta_migrations"');
      expect(sql).toContain('ORDER BY "version" ASC');
    });

    it("should generate INSERT", () => {
      const sql = dialect.insertRecord("dikta_migrations", "20260101120000", "add_users", "abc123");
      expect(sql).toContain('INSERT INTO "dikta_migrations"');
    });

    it("should generate DELETE", () => {
      const sql = dialect.deleteRecord("dikta_migrations", "20260101120000");
      expect(sql).toContain('DELETE FROM "dikta_migrations"');
    });
  });

  describe("factory", () => {
    it("should return correct target for each dialect", () => {
      expect(createChainDialect("postgresql").target).toBe("postgresql");
      expect(createChainDialect("mysql").target).toBe("mysql");
      expect(createChainDialect("sqlite").target).toBe("sqlite");
    });

    it("should support custom table names", () => {
      const dialect = createChainDialect("postgresql");
      const sql = dialect.createTrackingTable("custom_tracking");
      expect(sql).toContain('"custom_tracking"');
    });
  });
});
