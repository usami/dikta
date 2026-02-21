// Generator
export { createPostgreSQLGenerator, createMySQLGenerator, createSQLiteGenerator, createGenerator, generateAll } from "./generator.js";

// Config
export { loadConfig } from "./config.js";

// Schema (Zod validation)
export { generateSchemas, generateEntitySchema, fieldKindToZod } from "./schema.js";

// Manifest
export { generateManifest } from "./manifest.js";

// File utilities
export { fileHeader, toSnakeCase, toTableName, toPascalCase, toCamelCase } from "./file.js";

// PostgreSQL type mappings
export { fieldKindToPGType, cascadeRuleToPG } from "./targets/postgresql/types.js";

// MySQL type mappings
export { fieldKindToMySQLType, cascadeRuleToMySQL } from "./targets/mysql/types.js";

// SQLite type mappings
export { fieldKindToSQLiteType, cascadeRuleToSQLite } from "./targets/sqlite/types.js";

// Dialect
export { createPostgreSQLDialect } from "./targets/postgresql/dialect.js";
export { createMySQLDialect } from "./targets/mysql/dialect.js";
export { createSQLiteDialect } from "./targets/sqlite/dialect.js";

// Types
export type { GeneratedFile, CodeGenerator, DatabaseTarget, SQLDialect } from "./types.js";
export type { DiktaConfig } from "./config.js";
export type { Manifest, ManifestEntry } from "./manifest.js";
export type { AgentProtocolConfig } from "@dikta/agent-protocol";
