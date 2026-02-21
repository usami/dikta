import type { EntityRegistry, QueryRegistry } from "@dikta/core";
import type { GeneratedFile } from "../types.js";
import { generateOpenAPISchemas } from "./schema.js";
import { generateOpenAPIPaths } from "./paths.js";

// ── OpenAPI Config Types ─────────────────────────────────

export interface OpenAPIServerConfig {
  readonly url: string;
  readonly description?: string;
}

export interface OpenAPIContactConfig {
  readonly name?: string;
  readonly email?: string;
  readonly url?: string;
}

export interface OpenAPILicenseConfig {
  readonly name: string;
  readonly url?: string;
}

export type OpenAPIFormat = "json" | "yaml" | "both";

export interface OpenAPIConfig {
  readonly title?: string;
  readonly description?: string;
  readonly version?: string;
  readonly servers?: readonly OpenAPIServerConfig[];
  readonly contact?: OpenAPIContactConfig;
  readonly license?: OpenAPILicenseConfig;
  readonly format?: OpenAPIFormat;
}

// ── Standard Error Response Schema ───────────────────────

const ERROR_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    error: {
      type: "object",
      properties: {
        code: { type: "integer", description: "HTTP status code" },
        message: { type: "string", description: "Human-readable error message" },
        details: {
          type: ["array", "null"],
          items: { type: "string" },
          description: "Additional error details",
        },
      },
      required: ["code", "message"],
    },
  },
  required: ["error"],
};

function buildErrorResponses(): Record<string, unknown> {
  return {
    BadRequest: {
      description: "Bad request — invalid parameters or missing required fields",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ErrorResponse" },
        },
      },
    },
    NotFound: {
      description: "Resource not found",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ErrorResponse" },
        },
      },
    },
    InternalError: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ErrorResponse" },
        },
      },
    },
  };
}

// ── Path enrichment with error responses ─────────────────

function addErrorResponsesToPaths(paths: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [pathKey, pathItem] of Object.entries(paths)) {
    const item = pathItem as Record<string, Record<string, unknown>>;
    const enriched: Record<string, unknown> = {};
    for (const [method, operation] of Object.entries(item)) {
      const responses = operation.responses as Record<string, unknown>;
      enriched[method] = {
        ...operation,
        responses: {
          ...responses,
          "400": { $ref: "#/components/responses/BadRequest" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      };
    }
    result[pathKey] = enriched;
  }
  return result;
}

// ── Lightweight YAML serializer ──────────────────────────

function needsQuoting(s: string): boolean {
  return s === "" ||
    s === "true" || s === "false" ||
    s === "null" || s === "~" ||
    /^[\d.+-]/.test(s) ||
    /[:#\[\]{}&*!|>'"%@`,?\\]/.test(s) ||
    s.includes("\n");
}

function quoteYAML(s: string): string {
  if (needsQuoting(s)) return JSON.stringify(s);
  return s;
}

function quoteYAMLKey(key: string): string {
  if (/^\d+$/.test(key) || needsQuoting(key)) return JSON.stringify(key);
  return key;
}

function isScalar(v: unknown): boolean {
  return v === null || v === undefined || typeof v !== "object";
}

function scalarToYAML(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "string") return quoteYAML(v);
  return String(v);
}

/**
 * Recursive YAML line generator.
 *
 * Handles the subset of YAML needed for OpenAPI specs:
 * - Objects → indented `key: value` pairs
 * - Scalar arrays → flow style `[a, b, c]`
 * - Object arrays → block style with `- ` prefix
 * - Strings with special chars → JSON-quoted
 * - Numeric keys (HTTP status codes) → quoted
 */
function toYAMLLines(value: unknown, indent: number): string[] {
  const pad = "  ".repeat(indent);

  if (isScalar(value)) return [scalarToYAML(value)];

  if (Array.isArray(value)) {
    if (value.length === 0) return ["[]"];

    // Flow style for arrays of scalars (e.g. required: ["id", "name"])
    if (value.every(isScalar)) {
      return [`[${value.map(scalarToYAML).join(", ")}]`];
    }

    // Block style for arrays of objects (e.g. servers, parameters)
    const lines: string[] = [];
    for (const item of value) {
      if (typeof item === "object" && item !== null && !Array.isArray(item)) {
        const itemLines = toYAMLLines(item, indent + 1);
        lines.push(`${pad}- ${itemLines[0]!.trimStart()}`);
        for (let i = 1; i < itemLines.length; i++) {
          lines.push(`${pad}  ${itemLines[i]!.trimStart()}`);
        }
      } else {
        const itemLines = toYAMLLines(item, indent + 1);
        lines.push(`${pad}- ${itemLines[0]!.trimStart()}`);
      }
    }
    return lines;
  }

  // Object
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return ["{}"];

  const lines: string[] = [];
  for (const [key, val] of entries) {
    const fk = quoteYAMLKey(key);

    if (isScalar(val)) {
      lines.push(`${pad}${fk}: ${scalarToYAML(val)}`);
      continue;
    }

    if (Array.isArray(val)) {
      if (val.length === 0) {
        lines.push(`${pad}${fk}: []`);
      } else if (val.every(isScalar)) {
        lines.push(`${pad}${fk}: [${val.map(scalarToYAML).join(", ")}]`);
      } else {
        lines.push(`${pad}${fk}:`);
        lines.push(...toYAMLLines(val, indent + 1));
      }
      continue;
    }

    // Nested object
    const objEntries = Object.entries(val as Record<string, unknown>);
    if (objEntries.length === 0) {
      lines.push(`${pad}${fk}: {}`);
    } else {
      lines.push(`${pad}${fk}:`);
      lines.push(...toYAMLLines(val, indent + 1));
    }
  }

  return lines;
}

/**
 * Convert a JSON-compatible object to YAML string.
 * Designed for OpenAPI spec output — handles the subset of YAML
 * needed for well-structured API specifications.
 */
export function toYAML(obj: Record<string, unknown>): string {
  return toYAMLLines(obj, 0).join("\n") + "\n";
}

// ── Spec assembly ────────────────────────────────────────

/**
 * Assemble a complete OpenAPI 3.1 document from entity schemas and query contracts.
 *
 * Combines:
 * - Entity schemas → `components.schemas`
 * - Query contracts → `paths` with GET operations
 * - Standard error schemas → `components.schemas.ErrorResponse`
 * - Standard error responses → `components.responses` (400, 404, 500)
 */
export function assembleOpenAPISpec(
  schema: EntityRegistry,
  queries: QueryRegistry,
  config?: OpenAPIConfig,
): Record<string, unknown> {
  // Build component schemas from entities
  const schemaFiles = generateOpenAPISchemas(schema);
  const entitySchemas: Record<string, unknown> = schemaFiles.length > 0
    ? JSON.parse(schemaFiles[0]!.content) as Record<string, unknown>
    : {};

  // Build path operations from queries
  const pathFiles = generateOpenAPIPaths(schema, queries);
  const rawPaths: Record<string, unknown> = pathFiles.length > 0
    ? JSON.parse(pathFiles[0]!.content) as Record<string, unknown>
    : {};

  const hasPaths = Object.keys(rawPaths).length > 0;

  // Enrich paths with error responses
  const paths = hasPaths ? addErrorResponsesToPaths(rawPaths) : {};

  // Build info object
  const info: Record<string, unknown> = {
    title: config?.title ?? "API",
    version: config?.version ?? "1.0.0",
  };
  if (config?.description) info.description = config.description;
  if (config?.contact) {
    const contact: Record<string, unknown> = {};
    if (config.contact.name) contact.name = config.contact.name;
    if (config.contact.email) contact.email = config.contact.email;
    if (config.contact.url) contact.url = config.contact.url;
    info.contact = contact;
  }
  if (config?.license) {
    const license: Record<string, unknown> = { name: config.license.name };
    if (config.license.url) license.url = config.license.url;
    info.license = license;
  }

  // Assemble root document
  const spec: Record<string, unknown> = {
    openapi: "3.1.0",
    info,
  };

  if (config?.servers && config.servers.length > 0) {
    spec.servers = config.servers.map((s) => {
      const server: Record<string, unknown> = { url: s.url };
      if (s.description) server.description = s.description;
      return server;
    });
  }

  if (hasPaths) {
    spec.paths = paths;
  }

  // Components: entity schemas + error schema + error responses
  const components: Record<string, unknown> = {
    schemas: {
      ...entitySchemas,
      ErrorResponse: ERROR_RESPONSE_SCHEMA,
    },
  };

  if (hasPaths) {
    components.responses = buildErrorResponses();
  }

  spec.components = components;

  return spec;
}

// ── Public entry point ───────────────────────────────────

/**
 * Generate an OpenAPI 3.1 specification document from entity schemas and query contracts.
 *
 * Output format is controlled by `config.format`:
 * - `"json"` (default) → `openapi/spec.json`
 * - `"yaml"` → `openapi/spec.yaml`
 * - `"both"` → both files
 */
export function generateOpenAPISpec(
  schema: EntityRegistry,
  queries: QueryRegistry,
  config?: OpenAPIConfig,
): readonly GeneratedFile[] {
  const spec = assembleOpenAPISpec(schema, queries, config);
  const format = config?.format ?? "json";
  const files: GeneratedFile[] = [];

  if (format === "json" || format === "both") {
    files.push({
      path: "openapi/spec.json",
      content: JSON.stringify(spec, null, 2) + "\n",
      purpose: "OpenAPI 3.1 specification (JSON)",
      regeneratable: true,
    });
  }

  if (format === "yaml" || format === "both") {
    files.push({
      path: "openapi/spec.yaml",
      content: toYAML(spec),
      purpose: "OpenAPI 3.1 specification (YAML)",
      regeneratable: true,
    });
  }

  return files;
}
