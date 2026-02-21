// Generator
export { createPostgreSQLGenerator, createGenerator, generateAll } from "./generator.js";

// Config
export { loadConfig } from "./config.js";

// Manifest
export { generateManifest } from "./manifest.js";

// File utilities
export { fileHeader, toSnakeCase, toTableName, toPascalCase, toCamelCase } from "./file.js";

// PostgreSQL type mappings
export { fieldKindToPGType, cascadeRuleToPG } from "./targets/postgresql/types.js";

// Dialect
export { createPostgreSQLDialect } from "./targets/postgresql/dialect.js";

// Types
export type { GeneratedFile, CodeGenerator, DatabaseTarget, SQLDialect } from "./types.js";
export type { DiktaConfig } from "./config.js";
export type { Manifest, ManifestEntry } from "./manifest.js";
export type { AgentProtocolConfig } from "@dikta/agent-protocol";
