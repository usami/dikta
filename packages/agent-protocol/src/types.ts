// ── Agent context types ──────────────────────────────────────

export interface AgentContext {
  readonly version: "1.0";
  readonly schema_summary: SchemaSummary;
  readonly contracts_summary: ContractsSummary;
  readonly policies: AgentPolicies;
  readonly generation_instructions: GenerationInstructions;
}

export interface SchemaSummary {
  readonly entities: readonly string[];
  readonly relationships: readonly RelationshipSummary[];
  readonly pii_fields: readonly string[];
  readonly invariants_count: number;
  readonly state_machines: readonly string[];
}

export interface RelationshipSummary {
  readonly from: string;
  readonly to: string;
  readonly type: "many_to_one";
}

export interface ContractsSummary {
  readonly total: number;
  readonly by_entity: Readonly<Record<string, number>>;
  readonly performance_budgets: PerformanceBudgets;
}

export interface PerformanceBudgets {
  readonly index_only_count: number;
  readonly capped_queries: readonly CappedQuery[];
}

export interface CappedQuery {
  readonly query: string;
  readonly max_rows: number;
}

export interface AgentPolicies {
  readonly tenant_isolation: boolean;
  readonly pii_logging: boolean;
  readonly soft_delete: boolean;
  readonly [key: string]: boolean;
}

export interface GenerationInstructions {
  readonly target_db: string;
  readonly driver: string;
  readonly style: string;
  readonly error_handling: string;
}

// ── Task protocol types ──────────────────────────────────────

export type TaskKind =
  | "implement_query"
  | "add_entity"
  | "modify_schema"
  | "fix_contract_violation";

export interface AgentTask {
  readonly kind: TaskKind;
  readonly context: TaskContext;
  readonly constraints: readonly string[];
  readonly verification: readonly string[];
}

export interface TaskContext {
  readonly description: string;
  readonly entity?: string;
  readonly contract?: string;
  readonly read_first: readonly string[];
}

// ── Violation types ──────────────────────────────────────────

export type ViolationKind =
  | "scan_strategy"
  | "max_rows"
  | "row_filter"
  | "max_joins"
  | "validation_error"
  | "performance_conflict";

export interface Violation {
  readonly contract: string;
  readonly kind: ViolationKind;
  readonly expected: string;
  readonly actual: string;
  readonly suggestion: string;
  readonly fix_command?: string;
}

export interface ViolationReport {
  readonly violations: readonly Violation[];
}

// ── Config types ─────────────────────────────────────────────

export interface AgentProtocolConfig {
  readonly policies?: Partial<AgentPolicies>;
  readonly generation_instructions?: Partial<GenerationInstructions>;
}
