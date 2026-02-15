import type { EntityRegistry, QueryRegistry } from "@dikta/core";

export interface GeneratedFile {
  readonly path: string;
  readonly content: string;
  readonly purpose: string;
  readonly regeneratable: boolean;
}

export interface CodeGenerator {
  generateDDL(schema: EntityRegistry): readonly GeneratedFile[];
  generateAccessLayer(
    schema: EntityRegistry,
    queries: QueryRegistry,
  ): readonly GeneratedFile[];
  generateValidators(schema: EntityRegistry): readonly GeneratedFile[];
  generateContractTests(queries: QueryRegistry): readonly GeneratedFile[];
}
