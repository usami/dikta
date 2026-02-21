import type { EntityRegistry, QueryRegistry, FieldKind, FieldRole, CascadeRule } from "@dikta/core";

export interface GeneratedFile {
  readonly path: string;
  readonly content: string;
  readonly purpose: string;
  readonly regeneratable: boolean;
}

export interface CodeGenerator {
  generateDDL(schema: EntityRegistry, queries?: QueryRegistry): readonly GeneratedFile[];
  generateAccessLayer(
    schema: EntityRegistry,
    queries: QueryRegistry,
  ): readonly GeneratedFile[];
  generateValidators(schema: EntityRegistry): readonly GeneratedFile[];
  generateContractTests(queries: QueryRegistry): readonly GeneratedFile[];
  generateSchemas(schema: EntityRegistry): readonly GeneratedFile[];
  generateOpenAPI(schema: EntityRegistry): readonly GeneratedFile[];
  generateOpenAPIPaths(schema: EntityRegistry, queries: QueryRegistry): readonly GeneratedFile[];
  generateERDiagram(schema: EntityRegistry): readonly GeneratedFile[];
  generateSeedData(schema: EntityRegistry): readonly GeneratedFile[];
  generateGraphQL(schema: EntityRegistry): readonly GeneratedFile[];
  generateGraphQLOperations(schema: EntityRegistry, queries: QueryRegistry): readonly GeneratedFile[];
  generateGraphQLResolvers(schema: EntityRegistry, queries: QueryRegistry): readonly GeneratedFile[];
}

// ── Dialect Abstraction Layer ────────────────────────────────

export type DatabaseTarget = "postgresql" | "mysql" | "sqlite";

export interface SQLDialect {
  readonly target: DatabaseTarget;

  // Type mapping
  fieldKindToSQLType(kind: FieldKind, role: FieldRole): string;
  cascadeRuleToSQL(rule: CascadeRule): string | null;

  // SQL syntax
  quoteIdentifier(name: string): string;

  // DDL
  generateEnumConstraint(tableName: string, columnName: string, values: readonly string[]): string;
  generateTableComment(tableName: string, columnName: string, comment: string): string;
  readonly tableOptions: string;

  // Access layer
  readonly driverImport: string;
  readonly driverConnectionType: string;
  parameterPlaceholder(index: number): string;
}
