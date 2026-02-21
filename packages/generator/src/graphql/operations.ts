import type { EntityRegistry, QueryRegistry, QueryContract, ParamKind, ShapeKind, ShapeField } from "@dikta/core";
import type { GeneratedFile } from "../types.js";
import { toPascalCase } from "../file.js";

// ── ParamKind → GraphQL scalar mapping ──────────────────

const PARAM_KIND_TO_GRAPHQL: Readonly<Record<ParamKind, string>> = {
  uuid: "ID",
  string: "String",
  int: "Int",
  decimal: "Float",
  boolean: "Boolean",
  timestamp: "DateTime",
};

// ── ShapeKind → GraphQL scalar mapping ──────────────────

const SHAPE_KIND_TO_GRAPHQL: Readonly<Record<ShapeKind, string>> = {
  uuid: "ID",
  string: "String",
  decimal: "Float",
  integer: "Int",
  int: "Int",
  boolean: "Boolean",
  timestamp: "DateTime",
};

/**
 * Map a ParamKind to its GraphQL scalar type string.
 */
export function paramKindToGraphQL(kind: ParamKind): string {
  return PARAM_KIND_TO_GRAPHQL[kind];
}

/**
 * Map a ShapeField (direct ShapeKind or JOIN reference) to its GraphQL scalar type string.
 *
 * - Direct ShapeKind → scalar mapping
 * - JoinShapeField with explicit `type` → that type's mapping
 * - JoinShapeField without `type` → defaults to `String` (matches TS inference)
 */
export function shapeFieldToGraphQL(field: ShapeField): string {
  const kind: ShapeKind = typeof field === "string" ? field : (field.type ?? "string");
  return SHAPE_KIND_TO_GRAPHQL[kind];
}

// ── Default value formatting ────────────────────────────

function formatDefaultValue(value: unknown, kind: ParamKind): string {
  if (kind === "string" || kind === "uuid" || kind === "timestamp") {
    return `"${value}"`;
  }
  return String(value);
}

// ── Result type generation ──────────────────────────────

/**
 * Generate a GraphQL result type from a query contract's shape.
 *
 * Each query contract produces a named result type with fields
 * derived from the shape definition. All shape fields are non-null
 * since they are explicitly declared in the contract.
 *
 * Example output:
 * ```graphql
 * type GetActiveUsersResult {
 *   id: ID!
 *   name: String!
 *   email: String!
 * }
 * ```
 */
export function generateResultType(contract: QueryContract): string {
  const typeName = toPascalCase(contract.name) + "Result";
  const shape = contract.config.returns.shape;
  const lines: string[] = [];

  for (const [fieldName, shapeField] of Object.entries(shape)) {
    const graphqlType = shapeFieldToGraphQL(shapeField);
    lines.push(`  ${fieldName}: ${graphqlType}!`);
  }

  return `type ${typeName} {\n${lines.join("\n")}\n}`;
}

// ── Connection types (cursor pagination) ────────────────

/**
 * Generate Relay-style connection types for cursor-paginated queries.
 *
 * Creates two types:
 * - `{Name}Connection` — wrapper with `edges` array and `pageInfo`
 * - `{Name}Edge` — node + cursor pair
 *
 * References the shared `PageInfo` type (generated separately).
 */
export function generateConnectionTypes(contract: QueryContract): string {
  const baseName = toPascalCase(contract.name);

  const connection = [
    `type ${baseName}Connection {`,
    `  edges: [${baseName}Edge!]!`,
    `  pageInfo: PageInfo!`,
    `}`,
  ].join("\n");

  const edge = [
    `type ${baseName}Edge {`,
    `  node: ${baseName}Result!`,
    `  cursor: String!`,
    `}`,
  ].join("\n");

  return `${connection}\n\n${edge}`;
}

// ── Page types (offset pagination) ──────────────────────

/**
 * Generate page wrapper type for offset-paginated queries.
 *
 * Creates `{Name}Page` with `data` array and pagination metadata.
 */
export function generatePageType(contract: QueryContract): string {
  const baseName = toPascalCase(contract.name);

  return [
    `type ${baseName}Page {`,
    `  data: [${baseName}Result!]!`,
    `  total: Int!`,
    `  limit: Int!`,
    `  offset: Int!`,
    `}`,
  ].join("\n");
}

// ── Query field generation ──────────────────────────────

/**
 * Build the argument list string for a query field.
 *
 * - Required params without defaults → `name: Type!`
 * - Params with defaults → `name: Type = defaultValue`
 * - Optional params → `name: Type`
 * - Pagination adds implicit args (cursor, limit, offset)
 */
function buildArguments(contract: QueryContract): string {
  const params = contract.config.params ?? {};
  const pagination = contract.config.returns.pagination;
  const args: string[] = [];

  for (const [name, param] of Object.entries(params)) {
    const graphqlType = paramKindToGraphQL(param.type);
    const isRequired = param.required === true && param.default === undefined;

    if (isRequired) {
      args.push(`${name}: ${graphqlType}!`);
    } else if (param.default !== undefined) {
      args.push(`${name}: ${graphqlType} = ${formatDefaultValue(param.default, param.type)}`);
    } else {
      args.push(`${name}: ${graphqlType}`);
    }
  }

  // Implicit pagination arguments
  if (pagination === "cursor" && !("cursor" in params)) {
    args.push("cursor: String");
  }
  if (pagination === "offset") {
    if (!("limit" in params)) {
      args.push("limit: Int");
    }
    if (!("offset" in params)) {
      args.push("offset: Int");
    }
  }

  return args.length > 0 ? `(${args.join(", ")})` : "";
}

/**
 * Determine the return type for a query field based on pagination kind.
 *
 * - No pagination → `[{Name}Result!]!` (plain array)
 * - Cursor → `{Name}Connection!` (Relay connection)
 * - Offset → `{Name}Page!` (page wrapper)
 */
function queryReturnType(contract: QueryContract): string {
  const baseName = toPascalCase(contract.name);
  const pagination = contract.config.returns.pagination;

  if (pagination === "cursor") {
    return `${baseName}Connection!`;
  }
  if (pagination === "offset") {
    return `${baseName}Page!`;
  }
  return `[${baseName}Result!]!`;
}

/**
 * Generate a single Query field definition from a query contract.
 *
 * Example: `  getActiveUsers(tenantId: ID!): [GetActiveUsersResult!]!`
 */
export function queryToGraphQLField(contract: QueryContract): string {
  const args = buildArguments(contract);
  const ret = queryReturnType(contract);
  return `  ${contract.name}${args}: ${ret}`;
}

// ── Full SDL Assembly ───────────────────────────────────

/**
 * Generate the complete GraphQL operations SDL from query contracts.
 *
 * Output sections (in order):
 * 1. PageInfo type — shared by all cursor connections (if any)
 * 2. Result types — one per query contract, derived from shape
 * 3. Connection/Page types — pagination wrappers
 * 4. Query type — all query fields with arguments and return types
 */
export function generateGraphQLOperationsSchema(
  _schema: EntityRegistry,
  queries: QueryRegistry,
): string {
  const contracts = queries.list();
  if (contracts.length === 0) return "";

  const sections: string[] = [];

  // 1. PageInfo type (shared by all cursor connections)
  const needsPageInfo = contracts.some(
    (c) => c.config.returns.pagination === "cursor",
  );
  if (needsPageInfo) {
    sections.push([
      "type PageInfo {",
      "  hasNextPage: Boolean!",
      "  endCursor: String",
      "}",
    ].join("\n"));
  }

  // 2. Result types
  for (const contract of contracts) {
    sections.push(generateResultType(contract));
  }

  // 3. Connection/Page wrapper types
  for (const contract of contracts) {
    const pagination = contract.config.returns.pagination;
    if (pagination === "cursor") {
      sections.push(generateConnectionTypes(contract));
    } else if (pagination === "offset") {
      sections.push(generatePageType(contract));
    }
  }

  // 4. Query type
  const queryFields = contracts.map((c) => queryToGraphQLField(c));
  sections.push(`type Query {\n${queryFields.join("\n")}\n}`);

  return sections.join("\n\n") + "\n";
}

// ── Public entry point ──────────────────────────────────

/**
 * Generate GraphQL SDL operation definitions from query contracts.
 *
 * Produces a single `operations.graphql` file containing result types,
 * connection/page types, and the Query type block.
 *
 * Use alongside `schema.graphql` (from generateGraphQLTypes) for
 * a complete GraphQL schema with entity types and operations.
 */
export function generateGraphQLOperations(
  schema: EntityRegistry,
  queries: QueryRegistry,
): readonly GeneratedFile[] {
  const contracts = queries.list();
  if (contracts.length === 0) return [];

  const content = generateGraphQLOperationsSchema(schema, queries);

  return [
    {
      path: "graphql/operations.graphql",
      content,
      purpose: "GraphQL SDL query operations from query contracts",
      regeneratable: true,
    },
  ];
}
