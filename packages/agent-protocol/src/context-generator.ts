import type { EntityRegistry, QueryRegistry } from "@dikta/core";
import type {
  AgentContext,
  SchemaSummary,
  RelationshipSummary,
  ContractsSummary,
  PerformanceBudgets,
  CappedQuery,
  AgentPolicies,
  GenerationInstructions,
  AgentProtocolConfig,
} from "./types.js";

const DEFAULT_GENERATION_INSTRUCTIONS: GenerationInstructions = {
  target_db: "postgresql",
  driver: "postgres.js",
  style: "functions over classes",
  error_handling: "return Result<T, Error> pattern",
};

export function generateAgentContext(
  schema: EntityRegistry,
  queries: QueryRegistry,
  config?: AgentProtocolConfig,
): AgentContext {
  return Object.freeze({
    version: "1.0" as const,
    schema_summary: buildSchemaSummary(schema),
    contracts_summary: buildContractsSummary(queries),
    policies: buildPolicies(schema, queries, config?.policies),
    generation_instructions: buildGenerationInstructions(config?.generation_instructions),
  });
}

export function serializeAgentContext(context: AgentContext): string {
  return JSON.stringify(context, null, 2);
}

function buildSchemaSummary(schema: EntityRegistry): SchemaSummary {
  const entities = schema.list();

  const relationships: RelationshipSummary[] = schema
    .getRelationships()
    .map((r) => ({
      from: r.from,
      to: r.to,
      type: "many_to_one" as const,
    }));

  const piiFields = schema
    .findFieldsWithPolicy("pii", true)
    .map((f) => `${f.entity}.${f.field}`);

  const invariantsCount = entities.reduce(
    (sum, e) => sum + e.invariants.length,
    0,
  );

  const stateMachines: string[] = [];
  for (const entity of entities) {
    for (const [fieldName, field] of Object.entries(entity.fields)) {
      if (field.kind === "enum" && field.role === "status") {
        stateMachines.push(`${entity.name}.${fieldName}`);
      }
    }
  }

  return Object.freeze({
    entities: entities.map((e) => e.name),
    relationships,
    pii_fields: piiFields,
    invariants_count: invariantsCount,
    state_machines: stateMachines,
  });
}

function buildContractsSummary(queries: QueryRegistry): ContractsSummary {
  const contracts = queries.list();

  const byEntity: Record<string, number> = {};
  for (const contract of contracts) {
    const entity = contract.config.from;
    byEntity[entity] = (byEntity[entity] ?? 0) + 1;
  }

  return Object.freeze({
    total: contracts.length,
    by_entity: byEntity,
    performance_budgets: buildPerformanceBudgets(queries),
  });
}

function buildPerformanceBudgets(queries: QueryRegistry): PerformanceBudgets {
  const contracts = queries.list();

  let indexOnlyCount = 0;
  const cappedQueries: CappedQuery[] = [];

  for (const contract of contracts) {
    const perf = contract.config.performance;
    if (perf?.scan_strategy === "index_only") {
      indexOnlyCount++;
    }
    if (perf?.max_rows !== undefined) {
      cappedQueries.push({
        query: contract.name,
        max_rows: perf.max_rows,
      });
    }
  }

  return Object.freeze({
    index_only_count: indexOnlyCount,
    capped_queries: cappedQueries,
  });
}

function buildPolicies(
  schema: EntityRegistry,
  queries: QueryRegistry,
  overrides?: Partial<AgentPolicies>,
): AgentPolicies {
  // Auto-infer from registry data
  const hasRowFilter = queries.list().some(
    (q) => q.config.security?.row_filter !== undefined,
  );
  const hasPiiFields = schema.findFieldsWithPolicy("pii", true).length > 0;
  const hasSoftDelete = schema.getRelationships().some(
    (r) => r.cascade === "soft_delete",
  );

  return Object.freeze({
    tenant_isolation: hasRowFilter,
    pii_logging: hasPiiFields,
    soft_delete: hasSoftDelete,
    ...overrides,
  });
}

function buildGenerationInstructions(
  overrides?: Partial<GenerationInstructions>,
): GenerationInstructions {
  return Object.freeze({
    ...DEFAULT_GENERATION_INSTRUCTIONS,
    ...overrides,
  });
}
