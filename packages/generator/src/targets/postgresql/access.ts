import type {
  EntityRegistry,
  QueryRegistry,
  QueryContract,
  QueryContractConfig,
  ParamDefinition,
  ShapeField,
  JoinShapeField,
} from "@dikta/core";
import type { GeneratedFile } from "../../types.js";
import { fileHeader, toSnakeCase, toTableName, toPascalCase, toCamelCase } from "../../file.js";
import { paramKindToTSType, shapeKindToTSType } from "./types.js";

function isJoinField(field: ShapeField): field is JoinShapeField {
  return typeof field === "object" && "from" in field;
}

function generateParamsInterface(
  queryName: string,
  params: Record<string, ParamDefinition>,
): string {
  const lines = [`export interface ${toPascalCase(queryName)}Params {`];

  for (const [name, param] of Object.entries(params)) {
    const tsType = paramKindToTSType(param.type);
    const optional = param.required === true && param.default === undefined ? "" : "?";
    lines.push(`  readonly ${name}${optional}: ${tsType};`);
  }

  lines.push("}");
  return lines.join("\n");
}

function generateResultInterface(
  queryName: string,
  shape: Record<string, ShapeField>,
): string {
  const lines = [`export interface ${toPascalCase(queryName)}Result {`];

  for (const [name, field] of Object.entries(shape)) {
    if (isJoinField(field)) {
      const tsType = field.type ? shapeKindToTSType(field.type) : "string";
      lines.push(`  readonly ${name}: ${tsType};`);
    } else {
      const tsType = shapeKindToTSType(field);
      lines.push(`  readonly ${name}: ${tsType};`);
    }
  }

  lines.push("}");
  return lines.join("\n");
}

function resolveJoinInfo(
  field: JoinShapeField,
  fromEntity: string,
  schema: EntityRegistry,
): { targetTable: string; targetColumn: string; joinColumn: string } | null {
  const [targetEntity, targetField] = field.from.split(".") as [string, string];
  if (!targetEntity || !targetField) return null;

  const targetTable = toTableName(targetEntity);
  const targetColumn = toSnakeCase(targetField);

  // Find the FK field on the from entity that references the target entity
  const relationships = schema.getRelationships();
  const rel = relationships.find(
    (r) =>
      (r.from === fromEntity && r.to === targetEntity) ||
      (r.from === targetEntity && r.to === fromEntity),
  );

  if (!rel) return null;

  // Determine join column based on relationship direction
  const joinColumn =
    rel.from === fromEntity
      ? toSnakeCase(rel.fromField)
      : "id";

  return { targetTable, targetColumn, joinColumn };
}

function generateSQLConstant(
  _queryName: string,
  config: QueryContractConfig,
  schema: EntityRegistry,
): string {
  const tableName = toTableName(config.from);
  const shape = config.returns.shape;
  const params = config.params ?? {};

  // SELECT clause
  const selectParts: string[] = [];
  const joinClauses: string[] = [];
  const joinAliases = new Map<string, string>();
  let aliasCounter = 0;

  for (const [name, field] of Object.entries(shape)) {
    if (isJoinField(field)) {
      const [targetEntity] = field.from.split(".") as [string, string];
      if (!joinAliases.has(targetEntity)) {
        const alias = `t${++aliasCounter}`;
        joinAliases.set(targetEntity, alias);

        const joinInfo = resolveJoinInfo(field, config.from, schema);
        if (joinInfo) {
          const relationships = schema.getRelationships();
          const rel = relationships.find(
            (r) =>
              (r.from === config.from && r.to === targetEntity) ||
              (r.from === targetEntity && r.to === config.from),
          );

          if (rel && rel.from === config.from) {
            joinClauses.push(
              `  LEFT JOIN "${joinInfo.targetTable}" "${alias}" ON "${alias}"."id" = "${tableName}"."${joinInfo.joinColumn}"`,
            );
          } else if (rel) {
            joinClauses.push(
              `  LEFT JOIN "${joinInfo.targetTable}" "${alias}" ON "${alias}"."${toSnakeCase(rel.fromField)}" = "${tableName}"."id"`,
            );
          }
        }
      }

      const alias = joinAliases.get(targetEntity) ?? "t0";
      const [, targetField] = field.from.split(".") as [string, string];
      selectParts.push(
        `  "${alias}"."${toSnakeCase(targetField)}" AS "${toSnakeCase(name)}"`,
      );
    } else {
      selectParts.push(`  "${tableName}"."${toSnakeCase(name)}"`);
    }
  }

  // WHERE clause
  const whereParts: string[] = [];

  if (config.security?.row_filter) {
    whereParts.push(
      `"${tableName}"."${toSnakeCase(config.security.row_filter)}" = $1`,
    );
  }

  let paramIndex = whereParts.length + 1;
  for (const [paramName] of Object.entries(params)) {
    const columnName = toSnakeCase(paramName);
    whereParts.push(`"${tableName}"."${columnName}" = $${paramIndex}`);
    paramIndex++;
  }

  // ORDER BY
  const orderParts: string[] = [];
  if (config.returns.ordering) {
    for (const order of config.returns.ordering) {
      orderParts.push(
        `"${toSnakeCase(order.field)}" ${order.direction.toUpperCase()}`,
      );
    }
  }

  // Build SQL
  const sqlParts = [
    `SELECT\n${selectParts.join(",\n")}`,
    `FROM "${tableName}"`,
  ];

  if (joinClauses.length > 0) {
    sqlParts.push(joinClauses.join("\n"));
  }

  if (whereParts.length > 0) {
    sqlParts.push(`WHERE ${whereParts.join("\n  AND ")}`);
  }

  if (orderParts.length > 0) {
    sqlParts.push(`ORDER BY ${orderParts.join(", ")}`);
  }

  if (config.performance?.max_rows) {
    sqlParts.push(`LIMIT ${config.performance.max_rows}`);
  }

  return sqlParts.join("\n");
}

function generateQueryFunction(
  queryName: string,
  config: QueryContractConfig,
  schema: EntityRegistry,
): string {
  const funcName = toCamelCase(queryName);
  const paramsType = `${toPascalCase(queryName)}Params`;
  const resultType = `${toPascalCase(queryName)}Result`;
  const hasParams = config.params && Object.keys(config.params).length > 0;
  const params = config.params ?? {};

  const sqlConst = `SQL_${toSnakeCase(queryName).toUpperCase()}`;

  // Build template literal bindings for postgres.js
  const bindings: string[] = [];

  if (config.security?.row_filter) {
    bindings.push(`params.${config.security.row_filter}`);
  }

  for (const paramName of Object.keys(params)) {
    bindings.push(`params.${paramName}`);
  }

  const lines: string[] = [];

  // Function signature
  if (hasParams) {
    lines.push(
      `export async function ${funcName}(`,
      `  sql: Sql,`,
      `  params: ${paramsType},`,
      `): Promise<readonly ${resultType}[]> {`,
    );
  } else {
    lines.push(
      `export async function ${funcName}(`,
      `  sql: Sql,`,
      `): Promise<readonly ${resultType}[]> {`,
    );
  }

  // Function body with sql tagged template
  if (bindings.length > 0) {
    lines.push(
      "  const result = await sql<" + resultType + "[]>`",
      `    ${sqlConst.replace(/SQL_/, "\\${")}`,
      "  `;",
    );

    // Actually, let's use the sql tagged template properly
    lines.length = lines.length - 3; // Remove last 3 lines

    // Build the sql`` tagged template with proper parameter binding
    lines.push(`  const result = await sql\`${generateTemplateSQL(queryName, config, schema)}\`;`);
  } else {
    lines.push(`  const result = await sql\`${generateTemplateSQL(queryName, config, schema)}\`;`);
  }

  lines.push(
    `  return result as readonly ${resultType}[];`,
    "}",
  );

  return lines.join("\n");
}

function generateTemplateSQL(
  _queryName: string,
  config: QueryContractConfig,
  schema: EntityRegistry,
): string {
  const tableName = toTableName(config.from);
  const shape = config.returns.shape;
  const params = config.params ?? {};

  const selectParts: string[] = [];
  const joinClauses: string[] = [];
  const joinAliases = new Map<string, string>();
  let aliasCounter = 0;

  for (const [name, field] of Object.entries(shape)) {
    if (isJoinField(field)) {
      const [targetEntity] = field.from.split(".") as [string, string];
      if (!joinAliases.has(targetEntity)) {
        const alias = `t${++aliasCounter}`;
        joinAliases.set(targetEntity, alias);

        const joinInfo = resolveJoinInfo(field, config.from, schema);
        if (joinInfo) {
          const relationships = schema.getRelationships();
          const rel = relationships.find(
            (r) =>
              (r.from === config.from && r.to === targetEntity) ||
              (r.from === targetEntity && r.to === config.from),
          );

          if (rel && rel.from === config.from) {
            joinClauses.push(
              `LEFT JOIN "${joinInfo.targetTable}" "${alias}" ON "${alias}"."id" = "${tableName}"."${joinInfo.joinColumn}"`,
            );
          } else if (rel) {
            joinClauses.push(
              `LEFT JOIN "${joinInfo.targetTable}" "${alias}" ON "${alias}"."${toSnakeCase(rel.fromField)}" = "${tableName}"."id"`,
            );
          }
        }
      }

      const alias = joinAliases.get(targetEntity) ?? "t0";
      const [, targetField] = field.from.split(".") as [string, string];
      selectParts.push(`"${alias}"."${toSnakeCase(targetField)}" AS "${toSnakeCase(name)}"`);
    } else {
      selectParts.push(`"${tableName}"."${toSnakeCase(name)}"`);
    }
  }

  const whereParts: string[] = [];

  if (config.security?.row_filter) {
    whereParts.push(
      `"${tableName}"."${toSnakeCase(config.security.row_filter)}" = \${params.${config.security.row_filter}}`,
    );
  }

  for (const paramName of Object.keys(params)) {
    whereParts.push(
      `"${tableName}"."${toSnakeCase(paramName)}" = \${params.${paramName}}`,
    );
  }

  const orderParts: string[] = [];
  if (config.returns.ordering) {
    for (const order of config.returns.ordering) {
      orderParts.push(`"${toSnakeCase(order.field)}" ${order.direction.toUpperCase()}`);
    }
  }

  let sql = `SELECT ${selectParts.join(", ")} FROM "${tableName}"`;

  if (joinClauses.length > 0) {
    sql += " " + joinClauses.join(" ");
  }

  if (whereParts.length > 0) {
    sql += ` WHERE ${whereParts.join(" AND ")}`;
  }

  if (orderParts.length > 0) {
    sql += ` ORDER BY ${orderParts.join(", ")}`;
  }

  if (config.performance?.max_rows) {
    sql += ` LIMIT ${config.performance.max_rows}`;
  }

  return sql;
}

function generateQueryFile(
  contract: QueryContract,
  schema: EntityRegistry,
): string {
  const { name, config } = contract;
  const params = config.params ?? {};
  const hasParams = Object.keys(params).length > 0;

  const parts: string[] = [fileHeader(), ""];

  // Import postgres.js Sql type
  parts.push('import type { Sql } from "postgres";\n');

  // Params interface
  if (hasParams) {
    parts.push(generateParamsInterface(name, params), "");
  }

  // Result interface
  parts.push(generateResultInterface(name, config.returns.shape), "");

  // Raw SQL constant for test verification
  const sqlConstName = `SQL_${toSnakeCase(name).toUpperCase()}`;
  const rawSQL = generateSQLConstant(name, config, schema);
  parts.push(`export const ${sqlConstName} = \`${rawSQL}\`;\n`);

  // Query function
  parts.push(generateQueryFunction(name, config, schema), "");

  return parts.join("\n");
}

export function generateAccessLayer(
  schema: EntityRegistry,
  queries: QueryRegistry,
): readonly GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const exportNames: string[] = [];

  for (const contract of queries.list()) {
    const fileName = toSnakeCase(contract.name);
    exportNames.push(fileName);

    files.push({
      path: `access/${fileName}.ts`,
      content: generateQueryFile(contract, schema),
      purpose: `Typed access function for query "${contract.name}"`,
      regeneratable: true,
    });
  }

  // Index barrel
  if (exportNames.length > 0) {
    const barrelLines = [
      fileHeader(),
      "",
      ...exportNames.map((name) => `export * from "./${name}.js";`),
      "",
    ];

    files.push({
      path: "access/index.ts",
      content: barrelLines.join("\n"),
      purpose: "Access layer barrel export",
      regeneratable: true,
    });
  }

  return files;
}
