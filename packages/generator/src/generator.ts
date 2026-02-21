import type { EntityRegistry, QueryRegistry } from "@dikta/core";
import type { GeneratedFile, CodeGenerator, DatabaseTarget } from "./types.js";
import { generateDDL as generatePostgreSQLDDL } from "./targets/postgresql/ddl.js";
import { generateAccessLayer as generatePostgreSQLAccessLayer } from "./targets/postgresql/access.js";
import { generateValidators as generatePostgreSQLValidators } from "./targets/postgresql/validator.js";
import { generateContractTests as generatePostgreSQLContractTests } from "./targets/postgresql/test.js";
import { generateDDL as generateMySQLDDL } from "./targets/mysql/ddl.js";
import { generateAccessLayer as generateMySQLAccessLayer } from "./targets/mysql/access.js";
import { generateValidators as generateMySQLValidators } from "./targets/mysql/validator.js";
import { generateContractTests as generateMySQLContractTests } from "./targets/mysql/test.js";
import { generateDDL as generateSQLiteDDL } from "./targets/sqlite/ddl.js";
import { generateAccessLayer as generateSQLiteAccessLayer } from "./targets/sqlite/access.js";
import { generateValidators as generateSQLiteValidators } from "./targets/sqlite/validator.js";
import { generateContractTests as generateSQLiteContractTests } from "./targets/sqlite/test.js";
import { generateManifest } from "./manifest.js";
import { generateSchemas } from "./schema.js";
import { generateOpenAPISchemas, generateOpenAPIPaths, generateOpenAPISpec } from "./openapi/index.js";
import type { OpenAPIConfig } from "./openapi/index.js";
import { generateERDiagramFile } from "./diagram.js";
import { generateSeedDataFile } from "./seed.js";
import type { SeedConfig } from "./seed.js";

export function createPostgreSQLGenerator(): CodeGenerator {
  return Object.freeze({
    generateDDL(schema: EntityRegistry, queries?: QueryRegistry): readonly GeneratedFile[] {
      return generatePostgreSQLDDL(schema, queries);
    },

    generateAccessLayer(
      schema: EntityRegistry,
      queries: QueryRegistry,
    ): readonly GeneratedFile[] {
      return generatePostgreSQLAccessLayer(schema, queries);
    },

    generateValidators(schema: EntityRegistry): readonly GeneratedFile[] {
      return generatePostgreSQLValidators(schema);
    },

    generateContractTests(queries: QueryRegistry): readonly GeneratedFile[] {
      return generatePostgreSQLContractTests(queries);
    },

    generateSchemas(schema: EntityRegistry): readonly GeneratedFile[] {
      return generateSchemas(schema);
    },

    generateOpenAPI(schema: EntityRegistry): readonly GeneratedFile[] {
      return generateOpenAPISchemas(schema);
    },

    generateOpenAPIPaths(schema: EntityRegistry, queries: QueryRegistry): readonly GeneratedFile[] {
      return generateOpenAPIPaths(schema, queries);
    },

    generateERDiagram(schema: EntityRegistry): readonly GeneratedFile[] {
      return generateERDiagramFile(schema);
    },

    generateSeedData(schema: EntityRegistry): readonly GeneratedFile[] {
      return generateSeedDataFile(schema);
    },
  });
}

export function createMySQLGenerator(): CodeGenerator {
  return Object.freeze({
    generateDDL(schema: EntityRegistry, queries?: QueryRegistry): readonly GeneratedFile[] {
      return generateMySQLDDL(schema, queries);
    },

    generateAccessLayer(
      schema: EntityRegistry,
      queries: QueryRegistry,
    ): readonly GeneratedFile[] {
      return generateMySQLAccessLayer(schema, queries);
    },

    generateValidators(schema: EntityRegistry): readonly GeneratedFile[] {
      return generateMySQLValidators(schema);
    },

    generateContractTests(queries: QueryRegistry): readonly GeneratedFile[] {
      return generateMySQLContractTests(queries);
    },

    generateSchemas(schema: EntityRegistry): readonly GeneratedFile[] {
      return generateSchemas(schema);
    },

    generateOpenAPI(schema: EntityRegistry): readonly GeneratedFile[] {
      return generateOpenAPISchemas(schema);
    },

    generateOpenAPIPaths(schema: EntityRegistry, queries: QueryRegistry): readonly GeneratedFile[] {
      return generateOpenAPIPaths(schema, queries);
    },

    generateERDiagram(schema: EntityRegistry): readonly GeneratedFile[] {
      return generateERDiagramFile(schema);
    },

    generateSeedData(schema: EntityRegistry): readonly GeneratedFile[] {
      return generateSeedDataFile(schema);
    },
  });
}

export function createSQLiteGenerator(): CodeGenerator {
  return Object.freeze({
    generateDDL(schema: EntityRegistry, queries?: QueryRegistry): readonly GeneratedFile[] {
      return generateSQLiteDDL(schema, queries);
    },

    generateAccessLayer(
      schema: EntityRegistry,
      queries: QueryRegistry,
    ): readonly GeneratedFile[] {
      return generateSQLiteAccessLayer(schema, queries);
    },

    generateValidators(schema: EntityRegistry): readonly GeneratedFile[] {
      return generateSQLiteValidators(schema);
    },

    generateContractTests(queries: QueryRegistry): readonly GeneratedFile[] {
      return generateSQLiteContractTests(queries);
    },

    generateSchemas(schema: EntityRegistry): readonly GeneratedFile[] {
      return generateSchemas(schema);
    },

    generateOpenAPI(schema: EntityRegistry): readonly GeneratedFile[] {
      return generateOpenAPISchemas(schema);
    },

    generateOpenAPIPaths(schema: EntityRegistry, queries: QueryRegistry): readonly GeneratedFile[] {
      return generateOpenAPIPaths(schema, queries);
    },

    generateERDiagram(schema: EntityRegistry): readonly GeneratedFile[] {
      return generateERDiagramFile(schema);
    },

    generateSeedData(schema: EntityRegistry): readonly GeneratedFile[] {
      return generateSeedDataFile(schema);
    },
  });
}

export function createGenerator(target: DatabaseTarget = "postgresql"): CodeGenerator {
  switch (target) {
    case "postgresql":
      return createPostgreSQLGenerator();
    case "mysql":
      return createMySQLGenerator();
    case "sqlite":
      return createSQLiteGenerator();
  }
}

export function generateAll(
  schema: EntityRegistry,
  queries: QueryRegistry,
  target: DatabaseTarget = "postgresql",
  openapi?: OpenAPIConfig,
  seed?: SeedConfig,
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

  const generator = createGenerator(target);

  const ddlFiles = generator.generateDDL(schema, queries);
  const accessFiles = generator.generateAccessLayer(schema, queries);
  const validatorFiles = generator.generateValidators(schema);
  const testFiles = generator.generateContractTests(queries);
  const schemaFiles = generator.generateSchemas(schema);
  const openAPIFiles = generator.generateOpenAPI(schema);
  const openAPIPathFiles = generator.generateOpenAPIPaths(schema, queries);
  const openAPISpecFiles = generateOpenAPISpec(schema, queries, openapi);
  const diagramFiles = generator.generateERDiagram(schema);
  const seedFiles = generateSeedDataFile(schema, seed);

  const allFiles = [
    ...ddlFiles,
    ...accessFiles,
    ...validatorFiles,
    ...testFiles,
    ...schemaFiles,
    ...openAPIFiles,
    ...openAPIPathFiles,
    ...openAPISpecFiles,
    ...diagramFiles,
    ...seedFiles,
  ];

  const manifest = generateManifest(schema, queries, allFiles);

  return [...allFiles, manifest];
}
