// Definition builders
export {
  defineMigration,
  addEntity,
  removeEntity,
  renameEntity,
  addField,
  removeField,
  renameField,
  alterField,
  addInvariant,
  removeInvariant,
  fieldDefinitionToSpec,
} from "./definition.js";

// Planner
export { planMigration } from "./planner.js";

// Safety
export { evaluateSafety } from "./safety.js";

// Impact
export { analyzeImpact } from "./impact.js";

// SQL generation
export { generateMigrationFiles, generateMigrationDirectory } from "./sql-generator.js";

// Dialects
export { createMigrationDialect } from "./dialects/factory.js";
export { createPostgreSQLMigrationDialect } from "./dialects/postgresql.js";
export { createMySQLMigrationDialect } from "./dialects/mysql.js";
export { createSQLiteMigrationDialect } from "./dialects/sqlite.js";

// Types
export type {
  SchemaChange,
  AddEntityChange,
  RemoveEntityChange,
  RenameEntityChange,
  AddFieldChange,
  RemoveFieldChange,
  RenameFieldChange,
  AlterFieldChange,
  AddInvariantChange,
  RemoveInvariantChange,
  FieldSpec,
  FieldAlterations,
  SafetyLevel,
  ChangeRisk,
  SafetyEvaluation,
  ImpactSeverity,
  ContractImpact,
  IndexRecommendation,
  BackfillRequirement,
  MigrationImpact,
  MigrationConfig,
  MigrationDefinition,
  MigrationFiles,
  MigrationMetadata,
  MigrationPlan,
  MigrationDialect,
} from "./types.js";
