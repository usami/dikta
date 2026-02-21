import type { EntityRegistry, QueryRegistry, QueryContract, ParamKind, ShapeKind, ShapeField, ParamDefinition } from "@dikta/core";
import type { GeneratedFile } from "../types.js";
import { toSnakeCase } from "../file.js";

// ── ParamKind → JSON Schema ──────────────────────────────

const PARAM_KIND_TO_JSON_SCHEMA: Readonly<Record<ParamKind, { readonly type: string; readonly format?: string }>> = {
  uuid: { type: "string", format: "uuid" },
  string: { type: "string" },
  int: { type: "integer" },
  decimal: { type: "number" },
  boolean: { type: "boolean" },
  timestamp: { type: "string", format: "date-time" },
};

// ── ShapeKind → JSON Schema ─────────────────────────────

const SHAPE_KIND_TO_JSON_SCHEMA: Readonly<Record<ShapeKind, { readonly type: string; readonly format?: string }>> = {
  uuid: { type: "string", format: "uuid" },
  string: { type: "string" },
  decimal: { type: "number" },
  integer: { type: "integer" },
  int: { type: "integer" },
  boolean: { type: "boolean" },
  timestamp: { type: "string", format: "date-time" },
};

/**
 * Map a ParamKind to an OpenAPI 3.1 JSON Schema property.
 */
export function paramKindToJsonSchema(kind: ParamKind): Record<string, unknown> {
  const schema = PARAM_KIND_TO_JSON_SCHEMA[kind];
  return schema.format ? { type: schema.type, format: schema.format } : { type: schema.type };
}

/**
 * Map a ShapeField (direct ShapeKind or JOIN reference) to an OpenAPI 3.1 JSON Schema property.
 *
 * - Direct ShapeKind → type/format mapping
 * - JoinShapeField with explicit `type` → that type's mapping
 * - JoinShapeField without `type` → defaults to `{ type: "string" }` (matches TS inference)
 */
export function shapeFieldToJsonSchema(field: ShapeField): Record<string, unknown> {
  const kind: ShapeKind = typeof field === "string" ? field : (field.type ?? "string");
  const schema = SHAPE_KIND_TO_JSON_SCHEMA[kind];
  return schema.format ? { type: schema.type, format: schema.format } : { type: schema.type };
}

// ── Path derivation helpers ──────────────────────────────

function toKebabCase(name: string): string {
  return toSnakeCase(name).replace(/_/g, "-");
}

function pluralize(word: string): string {
  if (word.endsWith("s") || word.endsWith("x") || word.endsWith("z") ||
      word.endsWith("sh") || word.endsWith("ch")) {
    return word + "es";
  }
  if (word.endsWith("y") && word.length > 1) {
    const beforeY = word[word.length - 2]!;
    if (!"aeiou".includes(beforeY)) {
      return word.slice(0, -1) + "ies";
    }
  }
  return word + "s";
}

function entityToPathBase(entityName: string): string {
  return "/" + pluralize(toKebabCase(entityName));
}

/**
 * Determine if a param should be a path parameter.
 * Heuristic: required UUID param named "id" or "{entity_snake}_id".
 */
function isPathParam(name: string, param: ParamDefinition, entityName: string): boolean {
  if (param.required !== true || param.type !== "uuid") return false;
  if (name === "id") return true;
  if (name === toSnakeCase(entityName) + "_id") return true;
  return false;
}

// ── Parameter building ───────────────────────────────────

function buildParameter(
  name: string,
  param: ParamDefinition,
  location: "query" | "path",
): Record<string, unknown> {
  const schema = paramKindToJsonSchema(param.type);

  if (param.default !== undefined) {
    (schema as Record<string, unknown>).default = param.default;
  }

  const result: Record<string, unknown> = {
    name,
    in: location,
    required: location === "path" ? true : param.required === true,
    schema,
  };

  return result;
}

// ── Response schema building ─────────────────────────────

function buildItemSchema(contract: QueryContract): Record<string, unknown> {
  const shape = contract.config.returns.shape;
  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];

  for (const [fieldName, shapeField] of Object.entries(shape)) {
    properties[fieldName] = shapeFieldToJsonSchema(shapeField);
    required.push(fieldName);
  }

  return { type: "object", properties, required };
}

/**
 * Build the response schema, wrapping in a pagination envelope when applicable.
 *
 * - cursor → `{ data: [...], next_cursor, has_more }`
 * - offset → `{ data: [...], total, limit, offset }`
 * - none   → `[...]` (plain array)
 */
function buildResponseSchema(contract: QueryContract): Record<string, unknown> {
  const itemSchema = buildItemSchema(contract);
  const pagination = contract.config.returns.pagination;

  if (pagination === "cursor") {
    return {
      type: "object",
      properties: {
        data: { type: "array", items: itemSchema },
        next_cursor: { type: ["string", "null"] },
        has_more: { type: "boolean" },
      },
      required: ["data", "next_cursor", "has_more"],
    };
  }

  if (pagination === "offset") {
    return {
      type: "object",
      properties: {
        data: { type: "array", items: itemSchema },
        total: { type: "integer" },
        limit: { type: "integer" },
        offset: { type: "integer" },
      },
      required: ["data", "total", "limit", "offset"],
    };
  }

  return { type: "array", items: itemSchema };
}

// ── Path item generation ─────────────────────────────────

/**
 * Convert a single QueryContract to an OpenAPI Path Item (GET operation).
 *
 * Each query contract maps to one GET operation with:
 * - `operationId` from the contract name
 * - `summary` from the contract purpose
 * - Parameters from the contract params + implicit pagination params
 * - 200 response with the shape-derived schema
 */
export function queryToPathItem(contract: QueryContract): Record<string, unknown> {
  const entityName = contract.config.from;
  const contractParams = contract.config.params ?? {};
  const pagination = contract.config.returns.pagination;
  const parameters: Record<string, unknown>[] = [];

  // Map contract params to OpenAPI parameters
  for (const [name, param] of Object.entries(contractParams)) {
    const location = isPathParam(name, param, entityName) ? "path" : "query";
    parameters.push(buildParameter(name, param, location));
  }

  // Add implicit pagination parameters
  if (pagination === "cursor" && !("cursor" in contractParams)) {
    parameters.push({
      name: "cursor",
      in: "query",
      required: false,
      schema: { type: "string" },
    });
  }
  if (pagination === "offset") {
    if (!("limit" in contractParams)) {
      parameters.push({
        name: "limit",
        in: "query",
        required: false,
        schema: { type: "integer", default: 20 },
      });
    }
    if (!("offset" in contractParams)) {
      parameters.push({
        name: "offset",
        in: "query",
        required: false,
        schema: { type: "integer", default: 0 },
      });
    }
  }

  const operation: Record<string, unknown> = {
    operationId: contract.name,
    summary: contract.config.purpose,
    responses: {
      "200": {
        description: "Successful response",
        content: {
          "application/json": {
            schema: buildResponseSchema(contract),
          },
        },
      },
    },
  };

  if (parameters.length > 0) {
    operation.parameters = parameters;
  }

  return { get: operation };
}

// ── Path key derivation ──────────────────────────────────

/**
 * Derive the OpenAPI path key for a contract.
 *
 * Base path comes from the entity name (kebab-case, pluralized).
 * Required UUID params named `id` or `{entity}_id` are appended as path templates.
 *
 * Examples:
 * - from "Order", no path params → `/orders`
 * - from "Order", param `id: uuid required` → `/orders/{id}`
 * - from "OrderItem", param `order_item_id: uuid required` → `/order-items/{order_item_id}`
 */
function derivePathKey(contract: QueryContract): string {
  const entityName = contract.config.from;
  let path = entityToPathBase(entityName);

  const params = contract.config.params ?? {};
  for (const [name, param] of Object.entries(params)) {
    if (isPathParam(name, param, entityName)) {
      path += `/{${name}}`;
    }
  }

  return path;
}

// ── Public entry point ───────────────────────────────────

/**
 * Generate OpenAPI 3.1 path operations from query contracts.
 *
 * Path derivation:
 * - Entity name → `/{plural-kebab}` (e.g., Order → /orders)
 * - Path params from required UUID identifier params
 * - When multiple queries produce the same path key, each gets
 *   a disambiguated path: `/{entity}/{query-name-kebab}`
 */
export function generateOpenAPIPaths(
  _schema: EntityRegistry,
  queries: QueryRegistry,
): readonly GeneratedFile[] {
  const contracts = queries.list();
  if (contracts.length === 0) return [];

  // Group contracts by derived path key to detect collisions
  const byPathKey = new Map<string, QueryContract[]>();
  for (const contract of contracts) {
    const pathKey = derivePathKey(contract);
    const group = byPathKey.get(pathKey) ?? [];
    group.push(contract);
    byPathKey.set(pathKey, group);
  }

  const paths: Record<string, Record<string, unknown>> = {};

  for (const [pathKey, pathContracts] of byPathKey) {
    if (pathContracts.length === 1) {
      // Unique path — use as-is
      paths[pathKey] = queryToPathItem(pathContracts[0]!);
    } else {
      // Collision — disambiguate by appending query name slug
      for (const contract of pathContracts) {
        const disambiguatedPath = entityToPathBase(contract.config.from) + "/" + toKebabCase(contract.name);
        paths[disambiguatedPath] = queryToPathItem(contract);
      }
    }
  }

  const content = JSON.stringify(paths, null, 2) + "\n";

  return [
    {
      path: "openapi/paths.json",
      content,
      purpose: "OpenAPI 3.1 path operations from query contracts",
      regeneratable: true,
    },
  ];
}
