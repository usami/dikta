import type { AgentTask, TaskKind, TaskContext } from "./types.js";

const AGENT_CONTEXT_PATH = ".dikta/agent-context.json";

export interface CreateTaskOptions {
  readonly kind: TaskKind;
  readonly description: string;
  readonly entity?: string;
  readonly contract?: string;
  readonly constraints?: readonly string[];
  readonly verification?: readonly string[];
  readonly read_first?: readonly string[];
}

export function createTask(options: CreateTaskOptions): AgentTask {
  const readFirst = options.read_first
    ? [AGENT_CONTEXT_PATH, ...options.read_first.filter((p) => p !== AGENT_CONTEXT_PATH)]
    : [AGENT_CONTEXT_PATH];

  const context: TaskContext = Object.freeze({
    description: options.description,
    ...(options.entity !== undefined && { entity: options.entity }),
    ...(options.contract !== undefined && { contract: options.contract }),
    read_first: readFirst,
  });

  return Object.freeze({
    kind: options.kind,
    context,
    constraints: options.constraints ?? [],
    verification: options.verification ?? [],
  });
}

export function implementQueryTask(
  contractName: string,
  entityName: string,
): AgentTask {
  return createTask({
    kind: "implement_query",
    description: `Implement the "${contractName}" query contract for entity "${entityName}"`,
    entity: entityName,
    contract: contractName,
    constraints: [
      "Must match the query contract's params and returns shape exactly",
      "Must respect performance constraints (scan_strategy, max_rows, max_joins)",
      "Must include row_filter in WHERE clause if security contract requires it",
    ],
    verification: [
      "npx dikta verify",
      "pnpm typecheck",
      "pnpm test",
    ],
  });
}

export function addEntityTask(entityName: string): AgentTask {
  return createTask({
    kind: "add_entity",
    description: `Add new entity "${entityName}" to the schema`,
    entity: entityName,
    constraints: [
      "Define all fields with appropriate FieldKind and FieldRole",
      "Add invariants for business rules",
      "Add ref fields for relationships with correct cascade rules",
    ],
    verification: [
      "npx dikta verify",
      "pnpm typecheck",
      "pnpm test",
    ],
  });
}

export function modifySchemaTask(
  entityName: string,
  description: string,
): AgentTask {
  return createTask({
    kind: "modify_schema",
    description,
    entity: entityName,
    constraints: [
      "Ensure backward compatibility or create a migration",
      "Update affected query contracts",
      "Verify no invariant violations",
    ],
    verification: [
      "npx dikta verify",
      "pnpm typecheck",
      "pnpm test",
    ],
  });
}

export function fixContractViolationTask(
  contractName: string,
  violationKind: string,
  suggestion: string,
): AgentTask {
  return createTask({
    kind: "fix_contract_violation",
    description: `Fix ${violationKind} violation in contract "${contractName}": ${suggestion}`,
    contract: contractName,
    constraints: [
      `Address the ${violationKind} violation`,
      suggestion,
    ],
    verification: [
      "npx dikta verify",
      "pnpm typecheck",
      "pnpm test",
    ],
  });
}
