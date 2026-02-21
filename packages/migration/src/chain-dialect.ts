import type { DatabaseTarget } from "@dikta/generator";

// ── ChainDialect interface ──────────────────────────────────

/** Dialect for migration tracking table operations. */
export interface ChainDialect {
  readonly target: DatabaseTarget;

  /** CREATE TABLE IF NOT EXISTS for the tracking table. */
  createTrackingTable(tableName: string): string;

  /** SELECT all applied migrations ordered by version ASC. */
  selectApplied(tableName: string): string;

  /** INSERT a new migration record. */
  insertRecord(tableName: string, version: string, name: string, checksum: string): string;

  /** DELETE a migration record by version. */
  deleteRecord(tableName: string, version: string): string;
}

// ── PostgreSQL ──────────────────────────────────────────────

function createPostgreSQLChainDialect(): ChainDialect {
  return {
    target: "postgresql",

    createTrackingTable(tableName) {
      return [
        `CREATE TABLE IF NOT EXISTS "${tableName}" (`,
        `  "version" VARCHAR(14) NOT NULL PRIMARY KEY,`,
        `  "name" TEXT NOT NULL,`,
        `  "applied_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,`,
        `  "checksum" VARCHAR(64) NOT NULL`,
        `);`,
      ].join("\n");
    },

    selectApplied(tableName) {
      return `SELECT "version", "name", "applied_at", "checksum" FROM "${tableName}" ORDER BY "version" ASC;`;
    },

    insertRecord(tableName, version, name, checksum) {
      return `INSERT INTO "${tableName}" ("version", "name", "checksum") VALUES ('${version}', '${name}', '${checksum}');`;
    },

    deleteRecord(tableName, version) {
      return `DELETE FROM "${tableName}" WHERE "version" = '${version}';`;
    },
  };
}

// ── MySQL ───────────────────────────────────────────────────

function createMySQLChainDialect(): ChainDialect {
  return {
    target: "mysql",

    createTrackingTable(tableName) {
      return [
        `CREATE TABLE IF NOT EXISTS \`${tableName}\` (`,
        `  \`version\` VARCHAR(14) NOT NULL PRIMARY KEY,`,
        `  \`name\` TEXT NOT NULL,`,
        `  \`applied_at\` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),`,
        `  \`checksum\` VARCHAR(64) NOT NULL`,
        `) ENGINE=InnoDB;`,
      ].join("\n");
    },

    selectApplied(tableName) {
      return `SELECT \`version\`, \`name\`, \`applied_at\`, \`checksum\` FROM \`${tableName}\` ORDER BY \`version\` ASC;`;
    },

    insertRecord(tableName, version, name, checksum) {
      return `INSERT INTO \`${tableName}\` (\`version\`, \`name\`, \`checksum\`) VALUES ('${version}', '${name}', '${checksum}');`;
    },

    deleteRecord(tableName, version) {
      return `DELETE FROM \`${tableName}\` WHERE \`version\` = '${version}';`;
    },
  };
}

// ── SQLite ──────────────────────────────────────────────────

function createSQLiteChainDialect(): ChainDialect {
  return {
    target: "sqlite",

    createTrackingTable(tableName) {
      return [
        `CREATE TABLE IF NOT EXISTS "${tableName}" (`,
        `  "version" TEXT NOT NULL PRIMARY KEY,`,
        `  "name" TEXT NOT NULL,`,
        `  "applied_at" TEXT NOT NULL DEFAULT (datetime('now')),`,
        `  "checksum" TEXT NOT NULL`,
        `);`,
      ].join("\n");
    },

    selectApplied(tableName) {
      return `SELECT "version", "name", "applied_at", "checksum" FROM "${tableName}" ORDER BY "version" ASC;`;
    },

    insertRecord(tableName, version, name, checksum) {
      return `INSERT INTO "${tableName}" ("version", "name", "checksum") VALUES ('${version}', '${name}', '${checksum}');`;
    },

    deleteRecord(tableName, version) {
      return `DELETE FROM "${tableName}" WHERE "version" = '${version}';`;
    },
  };
}

// ── Factory ─────────────────────────────────────────────────

export function createChainDialect(target: DatabaseTarget): ChainDialect {
  switch (target) {
    case "postgresql":
      return createPostgreSQLChainDialect();
    case "mysql":
      return createMySQLChainDialect();
    case "sqlite":
      return createSQLiteChainDialect();
  }
}
