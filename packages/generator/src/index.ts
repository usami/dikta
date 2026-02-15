// Generator
export { createPostgreSQLGenerator, generateAll } from "./generator.js";

// Config
export { loadConfig } from "./config.js";

// Manifest
export { generateManifest } from "./manifest.js";

// File utilities
export { fileHeader, toSnakeCase, toTableName, toPascalCase, toCamelCase } from "./file.js";

// PostgreSQL type mappings
export { fieldKindToPGType, cascadeRuleToPG } from "./targets/postgresql/types.js";

// Types
export type { GeneratedFile, CodeGenerator } from "./types.js";
export type { DiktaConfig } from "./config.js";
export type { Manifest, ManifestEntry } from "./manifest.js";
