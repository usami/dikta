import type {
  EntityRegistry,
  EntityDefinition,
  FieldDefinition,
  EnumFieldDefinition,
  RefFieldDefinition,
  QueryRegistry,
} from "@dikta/core";
import type { GeneratedFile } from "../../types.js";
import { fileHeader, toSnakeCase, toTableName } from "../../file.js";
import { fieldKindToMySQLType, cascadeRuleToMySQL } from "./types.js";
import { topologicalSort } from "./topo-sort.js";

function isEnumField(
  field: FieldDefinition,
): field is EnumFieldDefinition<readonly string[]> {
  return field.kind === "enum";
}

function isRefField(field: FieldDefinition): field is RefFieldDefinition {
  return field.kind === "ref";
}

function generateColumnDef(
  fieldName: string,
  field: FieldDefinition,
): string {
  const columnName = toSnakeCase(fieldName);

  // MySQL uses native ENUM() type instead of TEXT + CHECK
  let mysqlType: string;
  if (isEnumField(field)) {
    const valueList = field.values.map((v) => `'${v}'`).join(", ");
    mysqlType = `ENUM(${valueList})`;
  } else {
    mysqlType = fieldKindToMySQLType(field.kind, field.role);
  }

  const parts = [`  \`${columnName}\` ${mysqlType}`];

  if (!field.nullable) {
    parts.push("NOT NULL");
  }

  if (field.role === "identifier") {
    parts.push("PRIMARY KEY");
  }

  // PII comment goes inline on column definition
  if (field.policy.pii) {
    parts.push("COMMENT 'PII: This column contains personally identifiable information'");
  }

  return parts.join(" ");
}

function generateForeignKeyConstraints(
  entity: EntityDefinition,
  tableName: string,
): string[] {
  const constraints: string[] = [];

  for (const [fieldName, field] of Object.entries(entity.fields)) {
    if (isRefField(field)) {
      const columnName = toSnakeCase(fieldName);
      const targetTable = toTableName(field.entity);
      const cascade = cascadeRuleToMySQL(field.cascade);

      let constraint = `  CONSTRAINT \`fk_${tableName}_${columnName}\` FOREIGN KEY (\`${columnName}\`) REFERENCES \`${targetTable}\`(\`id\`)`;
      if (cascade) {
        constraint += ` ${cascade}`;
      }
      constraints.push(constraint);
    }
  }

  return constraints;
}

function generateCreateTable(entity: EntityDefinition): string {
  const tableName = toTableName(entity.name);
  const columns: string[] = [];

  for (const [fieldName, field] of Object.entries(entity.fields)) {
    columns.push(generateColumnDef(fieldName, field));
  }

  const fkConstraints = generateForeignKeyConstraints(entity, tableName);
  const allParts = [...columns, ...fkConstraints];

  const lines = [
    `CREATE TABLE \`${tableName}\` (`,
    allParts.join(",\n"),
    ") ENGINE=InnoDB;",
  ];

  return lines.join("\n");
}

function generateIndexesForEntity(
  entity: EntityDefinition,
  tableName: string,
): string[] {
  const indexes: string[] = [];

  for (const [fieldName, field] of Object.entries(entity.fields)) {
    if (isRefField(field)) {
      const columnName = toSnakeCase(fieldName);
      indexes.push(
        `CREATE INDEX \`idx_${tableName}_${columnName}\` ON \`${tableName}\` (\`${columnName}\`);`,
      );
    }
  }

  return indexes;
}

export function generateDDL(
  schema: EntityRegistry,
  queries?: QueryRegistry,
): readonly GeneratedFile[] {
  const sorted = topologicalSort(schema);
  const files: GeneratedFile[] = [];

  // Per-entity migration files
  for (let i = 0; i < sorted.length; i++) {
    const entityName = sorted[i]!;
    const entity = schema.get(entityName);
    const tableName = toTableName(entityName);
    const seq = String(i + 1).padStart(3, "0");

    const content = [
      fileHeader(),
      generateCreateTable(entity),
      "",
    ].join("\n");

    files.push({
      path: `sql/${seq}_create_${tableName}.sql`,
      content,
      purpose: `CREATE TABLE for ${entityName}`,
      regeneratable: true,
    });
  }

  // Consolidated indexes file
  const allIndexes: string[] = [];

  for (const entityName of sorted) {
    const entity = schema.get(entityName);
    const tableName = toTableName(entityName);
    const entityIndexes = generateIndexesForEntity(entity, tableName);
    if (entityIndexes.length > 0) {
      allIndexes.push(`-- Indexes for ${entityName}`, ...entityIndexes, "");
    }
  }

  // Index on fields used in queries with scan_strategy: "index_only"
  if (queries) {
    for (const query of queries.list()) {
      if (query.config.performance?.scan_strategy === "index_only") {
        const tableName = toTableName(query.config.from);
        const params = query.config.params ?? {};
        for (const paramName of Object.keys(params)) {
          const columnName = toSnakeCase(paramName);
          allIndexes.push(
            `-- Query "${query.name}" requires index_only scan`,
            `CREATE INDEX \`idx_${tableName}_${columnName}\` ON \`${tableName}\` (\`${columnName}\`);`,
            "",
          );
        }
      }
    }
  }

  if (allIndexes.length > 0) {
    files.push({
      path: "sql/indexes.sql",
      content: fileHeader() + "\n" + allIndexes.join("\n") + "\n",
      purpose: "Index definitions for FK columns and query optimization",
      regeneratable: true,
    });
  }

  return files;
}
