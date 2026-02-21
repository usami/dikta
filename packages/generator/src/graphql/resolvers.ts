import type { EntityDefinition, EntityRegistry, FieldDefinition, QueryContract, QueryRegistry, ParamKind } from "@dikta/core";
import type { GeneratedFile } from "../types.js";
import { fileHeader, toPascalCase, toCamelCase } from "../file.js";

// ── ParamKind → TypeScript type mapping ─────────────────

const PARAM_KIND_TO_TS: Readonly<Record<ParamKind, string>> = {
  uuid: "string",
  string: "string",
  int: "number",
  decimal: "number",
  boolean: "boolean",
  timestamp: "string",
};

/**
 * Map a ParamKind to its TypeScript type string for resolver arguments.
 */
export function paramKindToTSType(kind: ParamKind): string {
  return PARAM_KIND_TO_TS[kind];
}

// ── Ref field detection ─────────────────────────────────

function isRefField(field: FieldDefinition): field is FieldDefinition & { readonly entity: string } {
  return field.kind === "ref" && "entity" in field;
}

// ── Ref field info ──────────────────────────────────────

export interface RefFieldInfo {
  readonly fieldName: string;
  readonly targetEntity: string;
}

/**
 * Collect all ref fields from an entity definition.
 * Each ref field will produce a nested resolver for relationship resolution.
 */
export function collectRefFields(entity: EntityDefinition): readonly RefFieldInfo[] {
  const refs: RefFieldInfo[] = [];
  for (const [fieldName, field] of Object.entries(entity.fields)) {
    if (isRefField(field)) {
      refs.push({ fieldName, targetEntity: field.entity });
    }
  }
  return refs;
}

// ── Query resolver generation ───────────────────────────

/**
 * Generate a single query resolver stub from a query contract.
 *
 * Produces typed args from the contract's params definition
 * and includes purpose/security metadata as comments.
 */
export function generateQueryResolver(contract: QueryContract): string {
  const lines: string[] = [];
  const params = contract.config.params ?? {};
  const hasParams = Object.keys(params).length > 0;

  // Purpose comment
  lines.push(`    // purpose: "${contract.config.purpose}"`);

  // Security comment if present
  if (contract.config.security?.row_filter) {
    lines.push(`    // security: row_filter on "${contract.config.security.row_filter}"`);
  }

  // Build typed args
  const argsType = hasParams
    ? `{ ${Object.entries(params).map(([name, param]) => {
        const tsType = paramKindToTSType(param.type);
        const optional = param.required === true && param.default === undefined ? "" : "?";
        return `${name}${optional}: ${tsType}`;
      }).join("; ")} }`
    : "Record<string, never>";

  lines.push(`    ${contract.name}: (`);
  lines.push(`      _parent: unknown,`);
  lines.push(`      ${hasParams ? "args" : "_args"}: ${argsType},`);
  lines.push(`      _ctx: GraphQLContext,`);
  lines.push(`    ) => {`);
  lines.push(`      // from: ${contract.config.from}`);
  lines.push(`      throw new Error("Not implemented: ${contract.name}");`);
  lines.push(`    },`);

  return lines.join("\n");
}

// ── Entity resolver generation (ref fields) ─────────────

/**
 * Generate nested resolvers for an entity's ref fields.
 *
 * Each ref field produces a resolver stub that hints at DataLoader usage
 * for N+1 prevention. For example, `Order.userId: ref("User")` generates:
 *
 * ```typescript
 * Order: {
 *   userId: (parent, _args, _ctx) => { ... }
 * }
 * ```
 */
export function generateEntityResolver(entity: EntityDefinition): string {
  const refs = collectRefFields(entity);
  if (refs.length === 0) return "";

  const typeName = toPascalCase(entity.name);
  const lines: string[] = [];

  lines.push(`  ${typeName}: {`);

  for (let i = 0; i < refs.length; i++) {
    const ref = refs[i]!;
    if (i > 0) lines.push("");
    lines.push(`    // Resolve ref: ${typeName}.${ref.fieldName} → ${toPascalCase(ref.targetEntity)}`);
    lines.push(`    // DataLoader hint: ctx.loaders.${toCamelCase(ref.targetEntity)}Loader.load(parent.${ref.fieldName})`);
    lines.push(`    ${ref.fieldName}: (`);
    lines.push(`      parent: { ${ref.fieldName}: string },`);
    lines.push(`      _args: unknown,`);
    lines.push(`      _ctx: GraphQLContext,`);
    lines.push(`    ) => {`);
    lines.push(`      throw new Error("Not implemented: ${typeName}.${ref.fieldName}");`);
    lines.push(`    },`);
  }

  lines.push(`  },`);

  return lines.join("\n");
}

// ── DataLoader hint collection ──────────────────────────

/**
 * Collect unique DataLoader type hints from all ref fields across entities.
 * Used in the GraphQLContext comment block.
 */
export function collectDataLoaderHints(schema: EntityRegistry): readonly string[] {
  const hints: string[] = [];
  const seen = new Set<string>();

  for (const entity of schema.list()) {
    for (const [, field] of Object.entries(entity.fields)) {
      if (isRefField(field) && !seen.has(field.entity)) {
        seen.add(field.entity);
        const loaderName = `${toCamelCase(field.entity)}Loader`;
        hints.push(`//     ${loaderName}: DataLoader<string, ${toPascalCase(field.entity)}>`);
      }
    }
  }

  return hints;
}

// ── Full resolver file generation ───────────────────────

/**
 * Generate the complete resolvers.ts file content.
 *
 * Output sections:
 * 1. File header
 * 2. GraphQLContext interface with DataLoader hints
 * 3. Resolver map with Query resolvers and entity relationship resolvers
 */
export function generateResolversFile(
  schema: EntityRegistry,
  queries: QueryRegistry,
): string {
  const contracts = queries.list();
  const entities = schema.list();

  const parts: string[] = [fileHeader(), ""];

  // Context type with DataLoader hints
  const loaderHints = collectDataLoaderHints(schema);
  parts.push("// GraphQL resolver context.");
  parts.push("// Extend with your database connection and DataLoaders.");
  if (loaderHints.length > 0) {
    parts.push("//");
    parts.push("// Suggested DataLoaders for relationship resolution:");
    parts.push(...loaderHints);
  }
  parts.push("export interface GraphQLContext {}\n");

  // Resolvers object
  parts.push("export const resolvers = {");

  // Query resolvers
  if (contracts.length > 0) {
    parts.push("  Query: {");
    for (let i = 0; i < contracts.length; i++) {
      if (i > 0) parts.push("");
      parts.push(generateQueryResolver(contracts[i]!));
    }
    parts.push("  },");
  }

  // Entity resolvers (ref fields)
  const entityResolverBlocks: string[] = [];
  for (const entity of entities) {
    const block = generateEntityResolver(entity);
    if (block) {
      entityResolverBlocks.push(block);
    }
  }

  if (entityResolverBlocks.length > 0) {
    parts.push("");
    parts.push("  // Relationship resolvers — use DataLoaders to prevent N+1 queries.");
    for (const block of entityResolverBlocks) {
      parts.push("");
      parts.push(block);
    }
  }

  parts.push("};\n");

  return parts.join("\n");
}

// ── Public entry point ──────────────────────────────────

/**
 * Generate GraphQL resolver stubs with typed context and DataLoader hints.
 *
 * Produces a single `resolvers.ts` file containing:
 * - `GraphQLContext` interface for dependency injection
 * - Query resolvers from query contracts
 * - Entity resolvers for ref field relationship resolution
 */
export function generateGraphQLResolvers(
  schema: EntityRegistry,
  queries: QueryRegistry,
): readonly GeneratedFile[] {
  const contracts = queries.list();
  const entities = schema.list();

  // Need at least queries or entities with ref fields
  const hasRefFields = entities.some((e) =>
    Object.values(e.fields).some((f) => f.kind === "ref"),
  );

  if (contracts.length === 0 && !hasRefFields) return [];

  const content = generateResolversFile(schema, queries);

  return [
    {
      path: "graphql/resolvers.ts",
      content,
      purpose: "GraphQL resolver stubs with typed context and DataLoader hints",
      regeneratable: true,
    },
  ];
}
