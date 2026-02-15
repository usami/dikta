import type { FieldKind, FieldRole, FieldPolicy, CascadeRule } from "@dikta/core";

// ── Field specification (no phantom types) ──────────────────

/** Migration's own field description — plain metadata, no phantom types. */
export interface FieldSpec {
  readonly kind: FieldKind;
  readonly nullable?: boolean;
  readonly role?: FieldRole;
  readonly description?: string;
  readonly policy?: FieldPolicy;
  /** Enum values (only for kind: "enum"). */
  readonly values?: readonly string[];
  /** Referenced entity name (only for kind: "ref"). */
  readonly entity?: string;
  /** Cascade rule (only for kind: "ref"). */
  readonly cascade?: CascadeRule;
  /** Raw PostgreSQL type override. */
  readonly pgType?: string;
}

// ── Field alterations ───────────────────────────────────────

/** Describes what changed on a field. Only changed properties are present. */
export interface FieldAlterations {
  readonly kind?: { readonly from: FieldKind; readonly to: FieldKind };
  readonly nullable?: { readonly from: boolean; readonly to: boolean };
  readonly role?: { readonly from: FieldRole; readonly to: FieldRole };
  readonly description?: { readonly from: string; readonly to: string };
  readonly policy?: { readonly from: FieldPolicy; readonly to: FieldPolicy };
  readonly values?: { readonly added: readonly string[]; readonly removed: readonly string[] };
  readonly entity?: { readonly from: string; readonly to: string };
  readonly cascade?: { readonly from: CascadeRule; readonly to: CascadeRule };
}

// ── Schema changes (discriminated union on `kind`) ──────────

export interface AddEntityChange {
  readonly kind: "add_entity";
  readonly entity: string;
  readonly fields: Readonly<Record<string, FieldSpec>>;
}

export interface RemoveEntityChange {
  readonly kind: "remove_entity";
  readonly entity: string;
}

export interface RenameEntityChange {
  readonly kind: "rename_entity";
  readonly from: string;
  readonly to: string;
}

export interface AddFieldChange {
  readonly kind: "add_field";
  readonly entity: string;
  readonly field: string;
  readonly spec: FieldSpec;
  /** SQL expression for backfilling existing rows. */
  readonly backfill?: string;
}

export interface RemoveFieldChange {
  readonly kind: "remove_field";
  readonly entity: string;
  readonly field: string;
}

export interface RenameFieldChange {
  readonly kind: "rename_field";
  readonly entity: string;
  readonly from: string;
  readonly to: string;
}

export interface AlterFieldChange {
  readonly kind: "alter_field";
  readonly entity: string;
  readonly field: string;
  readonly changes: FieldAlterations;
}

export interface AddInvariantChange {
  readonly kind: "add_invariant";
  readonly entity: string;
  readonly invariant: string;
}

export interface RemoveInvariantChange {
  readonly kind: "remove_invariant";
  readonly entity: string;
  readonly invariant: string;
}

export type SchemaChange =
  | AddEntityChange
  | RemoveEntityChange
  | RenameEntityChange
  | AddFieldChange
  | RemoveFieldChange
  | RenameFieldChange
  | AlterFieldChange
  | AddInvariantChange
  | RemoveInvariantChange;

// ── Safety types ────────────────────────────────────────────

export type SafetyLevel = "safe" | "caution" | "dangerous";

export interface ChangeRisk {
  readonly change: SchemaChange;
  readonly online: boolean;
  readonly dataLoss: boolean;
  readonly reversible: boolean;
  readonly notes: readonly string[];
}

export interface SafetyEvaluation {
  readonly level: SafetyLevel;
  readonly risks: readonly ChangeRisk[];
  readonly summary: string;
}

// ── Impact types ────────────────────────────────────────────

export type ImpactSeverity = "breaking" | "compatible" | "informational";

export interface ContractImpact {
  readonly query: string;
  readonly severity: ImpactSeverity;
  readonly reasons: readonly string[];
}

export interface IndexRecommendation {
  readonly action: "add" | "remove";
  readonly entity: string;
  readonly field: string;
  readonly reason: string;
}

export interface BackfillRequirement {
  readonly entity: string;
  readonly field: string;
  readonly reason: string;
}

export interface MigrationImpact {
  readonly contracts: readonly ContractImpact[];
  readonly indexRecommendations: readonly IndexRecommendation[];
  readonly backfillRequirements: readonly BackfillRequirement[];
}

// ── Migration types ─────────────────────────────────────────

export interface MigrationConfig {
  readonly changes: readonly SchemaChange[];
  readonly description?: string;
  readonly timestamp?: string;
}

export interface MigrationDefinition {
  readonly name: string;
  readonly config: MigrationConfig;
}

export interface MigrationFiles {
  readonly up: string;
  readonly down: string;
  readonly verify: string;
  readonly metadata: MigrationMetadata;
}

export interface MigrationMetadata {
  readonly name: string;
  readonly description: string;
  readonly timestamp: string;
  readonly changes: readonly SchemaChange[];
  readonly safety: SafetyEvaluation;
  readonly impact: MigrationImpact;
}

export interface MigrationPlan {
  readonly changes: readonly SchemaChange[];
  readonly impact: MigrationImpact;
  readonly safety: SafetyEvaluation;
}
