import type { DatabaseTarget } from "@dikta/generator";
import type { MigrationDialect } from "../types.js";
import { createPostgreSQLMigrationDialect } from "./postgresql.js";
import { createMySQLMigrationDialect } from "./mysql.js";

export function createMigrationDialect(target: DatabaseTarget): MigrationDialect {
  switch (target) {
    case "postgresql":
      return createPostgreSQLMigrationDialect();
    case "mysql":
      return createMySQLMigrationDialect();
    case "sqlite":
      throw new Error("SQLite migration dialect is not yet implemented");
  }
}
