#!/usr/bin/env node

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Command } from "commander";
import { loadConfig } from "./config.js";

// Dynamic import helper for @dikta/migration (avoids circular package dependency).
// Variable indirection prevents TypeScript from statically resolving the module.
const MIGRATION_PKG = "@dikta/migration";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadMigrationPkg(): Promise<any> {
  return import(MIGRATION_PKG);
}
import { generateAll, createGenerator } from "./generator.js";
import { generateOpenAPISpec } from "./openapi/index.js";
import type { OpenAPIConfig, OpenAPIFormat } from "./openapi/index.js";
import { generateERDiagramFile } from "./diagram.js";
import { generateSeedDataFile } from "./seed.js";
import { generateGraphQLTypes } from "./graphql/index.js";
import {
  generateAgentContext,
  serializeAgentContext,
  generateInstructions,
  buildViolationReport,
  serializeViolationReport,
} from "@dikta/agent-protocol";
import type { GeneratedFile } from "./types.js";

function writeFiles(files: readonly GeneratedFile[], outputDir: string): void {
  for (const file of files) {
    const fullPath = join(outputDir, file.path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, file.content, "utf-8");
  }
}

const program = new Command()
  .name("dikta")
  .description("Target-aware code generator for Dikta intent schemas and query contracts")
  .version("0.1.0");

program
  .command("generate")
  .description("Generate DDL, access layer, validators, and tests for the configured target")
  .option("--ddl", "Generate only DDL files")
  .option("--access", "Generate only access layer files")
  .option("--validators", "Generate only validator files")
  .option("--tests", "Generate only contract test files")
  .option("--schemas", "Generate only Zod validation schema files")
  .option("--openapi", "Generate only OpenAPI 3.1 specification")
  .option("--openapi-format <format>", "OpenAPI output format: json (default), yaml, or both")
  .option("--diagram", "Generate only Mermaid ER diagram")
  .option("--seed", "Generate only faker-based seed data")
  .option("--graphql", "Generate only GraphQL SDL type definitions")
  .option("-o, --output <dir>", "Output directory", ".generated")
  .option("-c, --config <path>", "Path to dikta config file")
  .action(async (opts: {
    ddl?: boolean;
    access?: boolean;
    validators?: boolean;
    tests?: boolean;
    schemas?: boolean;
    openapi?: boolean;
    openapiFormat?: string;
    diagram?: boolean;
    seed?: boolean;
    graphql?: boolean;
    output: string;
    config?: string;
  }) => {
    try {
      const config = await loadConfig(opts.config);
      const generator = createGenerator(config.target);
      const selective = opts.ddl || opts.access || opts.validators || opts.tests || opts.schemas || opts.openapi || opts.diagram || opts.seed || opts.graphql;

      // Merge CLI format override with config
      const openapiConfig: OpenAPIConfig = {
        ...config.openapi,
        ...(opts.openapiFormat ? { format: opts.openapiFormat as OpenAPIFormat } : {}),
      };

      let files: readonly GeneratedFile[];

      if (selective) {
        const parts: GeneratedFile[] = [];
        if (opts.ddl) {
          parts.push(...generator.generateDDL(config.schema));
        }
        if (opts.access) {
          parts.push(
            ...generator.generateAccessLayer(config.schema, config.queries),
          );
        }
        if (opts.validators) {
          parts.push(...generator.generateValidators(config.schema));
        }
        if (opts.tests) {
          parts.push(...generator.generateContractTests(config.queries));
        }
        if (opts.schemas) {
          parts.push(...generator.generateSchemas(config.schema));
        }
        if (opts.openapi) {
          parts.push(
            ...generateOpenAPISpec(config.schema, config.queries, openapiConfig),
          );
        }
        if (opts.diagram) {
          parts.push(...generateERDiagramFile(config.schema));
        }
        if (opts.seed) {
          parts.push(...generateSeedDataFile(config.schema, config.seed));
        }
        if (opts.graphql) {
          parts.push(...generateGraphQLTypes(config.schema));
        }
        files = parts;
      } else {
        files = generateAll(config.schema, config.queries, config.target, openapiConfig, config.seed);
      }

      writeFiles(files, opts.output);
      console.log(`Generated ${files.length} file(s) in ${opts.output}/`);
    } catch (error) {
      console.error(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exit(1);
    }
  });

program
  .command("verify")
  .description("Verify query contracts against schema without generating")
  .option("-c, --config <path>", "Path to dikta config file")
  .option("-f, --format <format>", "Output format: text (default) or agent", "text")
  .action(async (opts: { config?: string; format: string }) => {
    try {
      const config = await loadConfig(opts.config);

      if (opts.format === "agent") {
        const report = buildViolationReport(config.queries);
        console.log(serializeViolationReport(report));
        if (report.violations.length > 0) {
          process.exit(1);
        }
        return;
      }

      const errors = config.queries.validate();
      if (errors.length > 0) {
        console.error("Contract validation failed:");
        for (const error of errors) {
          const field = error.field ? `.${error.field}` : "";
          console.error(`  - ${error.query}${field}: ${error.message}`);
        }
        process.exit(1);
      }

      const conflicts = config.queries.detectPerformanceConflicts();
      if (conflicts.length > 0) {
        console.warn("Performance conflicts detected:");
        for (const conflict of conflicts) {
          console.warn(
            `  - ${conflict.queries.join(", ")}: ${conflict.message}`,
          );
        }
      }

      console.log("All contracts verified successfully.");
    } catch (error) {
      console.error(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exit(1);
    }
  });

program
  .command("context")
  .description("Generate agent context files in .dikta/ directory")
  .option("-c, --config <path>", "Path to dikta config file")
  .option("-o, --output <dir>", "Output directory", ".dikta")
  .action(async (opts: { config?: string; output: string }) => {
    try {
      const config = await loadConfig(opts.config);

      const context = generateAgentContext(
        config.schema,
        config.queries,
        config.agentProtocol,
      );

      mkdirSync(opts.output, { recursive: true });

      // Write agent-context.json
      const contextPath = join(opts.output, "agent-context.json");
      writeFileSync(contextPath, serializeAgentContext(context), "utf-8");

      // Write INSTRUCTIONS.md
      const instructionsPath = join(opts.output, "INSTRUCTIONS.md");
      writeFileSync(instructionsPath, generateInstructions(context), "utf-8");

      console.log(`Generated agent context in ${opts.output}/`);
      console.log(`  - ${contextPath}`);
      console.log(`  - ${instructionsPath}`);
    } catch (error) {
      console.error(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exit(1);
    }
  });

// ── Migrate command group ───────────────────────────────────

const migrate = program
  .command("migrate")
  .description("Run database migrations (up, down, status)");

migrate
  .command("up")
  .description("Apply pending migrations")
  .option("--target <version>", "Apply up to this version (inclusive)")
  .option("--count <n>", "Maximum number of migrations to apply")
  .option("--migrations-dir <dir>", "Migrations directory")
  .option("-c, --config <path>", "Path to dikta config file")
  .action(async (opts: {
    target?: string;
    count?: string;
    migrationsDir?: string;
    config?: string;
  }) => {
    try {
      const config = await loadConfig(opts.config);
      const executor = config.migration?.executor;
      if (!executor) {
        console.error("Error: migration.executor is required in dikta config for migrate commands");
        process.exit(1);
      }

      const { migrateUp } = await loadMigrationPkg();

      const chainConfig = {
        migrationsDir: resolve(opts.migrationsDir ?? config.migration?.migrationsDir ?? "migrations"),
        target: config.target ?? "postgresql" as const,
        tableName: config.migration?.tableName,
      };

      const result = await migrateUp(executor, chainConfig, {
        target: opts.target,
        count: opts.count ? parseInt(opts.count, 10) : undefined,
      });

      if (result.applied.length > 0) {
        for (const m of result.applied) {
          console.log(`  Applied: ${m.version} ${m.name}`);
        }
        console.log(`\n${result.applied.length} migration(s) applied.`);
      } else {
        console.log("No pending migrations.");
      }

      if (result.errors.length > 0) {
        for (const e of result.errors) {
          console.error(`  Error: ${e.version} ${e.name} — ${e.message}`);
        }
        process.exit(1);
      }
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

migrate
  .command("down")
  .description("Roll back applied migrations")
  .option("--target <version>", "Roll back to this version (stays applied)")
  .option("--count <n>", "Number of migrations to roll back (default: 1)")
  .option("--migrations-dir <dir>", "Migrations directory")
  .option("-c, --config <path>", "Path to dikta config file")
  .action(async (opts: {
    target?: string;
    count?: string;
    migrationsDir?: string;
    config?: string;
  }) => {
    try {
      const config = await loadConfig(opts.config);
      const executor = config.migration?.executor;
      if (!executor) {
        console.error("Error: migration.executor is required in dikta config for migrate commands");
        process.exit(1);
      }

      const { migrateDown } = await loadMigrationPkg();

      const chainConfig = {
        migrationsDir: resolve(opts.migrationsDir ?? config.migration?.migrationsDir ?? "migrations"),
        target: config.target ?? "postgresql" as const,
        tableName: config.migration?.tableName,
      };

      const result = await migrateDown(executor, chainConfig, {
        target: opts.target,
        count: opts.count ? parseInt(opts.count, 10) : undefined,
      });

      if (result.applied.length > 0) {
        for (const m of result.applied) {
          console.log(`  Rolled back: ${m.version} ${m.name}`);
        }
        console.log(`\n${result.applied.length} migration(s) rolled back.`);
      } else {
        console.log("No migrations to roll back.");
      }

      if (result.errors.length > 0) {
        for (const e of result.errors) {
          console.error(`  Error: ${e.version} ${e.name} — ${e.message}`);
        }
        process.exit(1);
      }
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

migrate
  .command("status")
  .description("Show migration status")
  .option("--migrations-dir <dir>", "Migrations directory")
  .option("-c, --config <path>", "Path to dikta config file")
  .action(async (opts: {
    migrationsDir?: string;
    config?: string;
  }) => {
    try {
      const config = await loadConfig(opts.config);
      const executor = config.migration?.executor;
      if (!executor) {
        console.error("Error: migration.executor is required in dikta config for migrate commands");
        process.exit(1);
      }

      const { getMigrationStatus } = await loadMigrationPkg();

      const chainConfig = {
        migrationsDir: resolve(opts.migrationsDir ?? config.migration?.migrationsDir ?? "migrations"),
        target: config.target ?? "postgresql" as const,
        tableName: config.migration?.tableName,
      };

      const status = await getMigrationStatus(executor, chainConfig);

      if (status.total === 0) {
        console.log("No migrations found.");
        return;
      }

      console.log(`Migrations: ${status.applied} applied, ${status.pending} pending, ${status.total} total\n`);

      for (const entry of status.entries) {
        const marker = entry.status === "applied" ? "[x]" : "[ ]";
        const mismatch = entry.checksumMismatch ? " (checksum mismatch!)" : "";
        const appliedAt = entry.appliedAt ? ` (${entry.appliedAt})` : "";
        console.log(`  ${marker} ${entry.version} ${entry.name}${appliedAt}${mismatch}`);
      }
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

program.parse();
