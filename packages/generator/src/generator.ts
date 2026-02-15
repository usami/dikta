import type { EntityRegistry, QueryRegistry } from "@dikta/core";
import type { GeneratedFile, CodeGenerator } from "./types.js";
import { generateDDL } from "./targets/postgresql/ddl.js";
import { generateAccessLayer } from "./targets/postgresql/access.js";
import { generateValidators } from "./targets/postgresql/validator.js";
import { generateContractTests } from "./targets/postgresql/test.js";
import { generateManifest } from "./manifest.js";

export function createPostgreSQLGenerator(): CodeGenerator {
  return Object.freeze({
    generateDDL(schema: EntityRegistry): readonly GeneratedFile[] {
      return generateDDL(schema);
    },

    generateAccessLayer(
      schema: EntityRegistry,
      queries: QueryRegistry,
    ): readonly GeneratedFile[] {
      return generateAccessLayer(schema, queries);
    },

    generateValidators(schema: EntityRegistry): readonly GeneratedFile[] {
      return generateValidators(schema);
    },

    generateContractTests(queries: QueryRegistry): readonly GeneratedFile[] {
      return generateContractTests(queries);
    },
  });
}

export function generateAll(
  schema: EntityRegistry,
  queries: QueryRegistry,
): readonly GeneratedFile[] {
  // Validate contracts before generating
  const errors = queries.validate();
  if (errors.length > 0) {
    const messages = errors.map(
      (e) =>
        `  - ${e.query}${e.field ? `.${e.field}` : ""}: ${e.message}`,
    );
    throw new Error(
      `Query contract validation failed:\n${messages.join("\n")}`,
    );
  }

  const generator = createPostgreSQLGenerator();

  const ddlFiles = generateDDL(schema, queries);
  const accessFiles = generator.generateAccessLayer(schema, queries);
  const validatorFiles = generator.generateValidators(schema);
  const testFiles = generator.generateContractTests(queries);

  const allFiles = [
    ...ddlFiles,
    ...accessFiles,
    ...validatorFiles,
    ...testFiles,
  ];

  const manifest = generateManifest(schema, queries, allFiles);

  return [...allFiles, manifest];
}
