// Context generator
export { generateAgentContext, serializeAgentContext } from "./context-generator.js";

// Task protocol
export {
  createTask,
  implementQueryTask,
  addEntityTask,
  modifySchemaTask,
  fixContractViolationTask,
} from "./task-protocol.js";

// Violation reporter
export { buildViolationReport, serializeViolationReport } from "./violation-reporter.js";

// Instructions
export { generateInstructions } from "./instructions.js";

// Types
export type {
  AgentContext,
  SchemaSummary,
  RelationshipSummary,
  ContractsSummary,
  PerformanceBudgets,
  CappedQuery,
  AgentPolicies,
  GenerationInstructions,
  TaskKind,
  AgentTask,
  TaskContext,
  ViolationKind,
  Violation,
  ViolationReport,
  AgentProtocolConfig,
} from "./types.js";

export type { CreateTaskOptions } from "./task-protocol.js";
