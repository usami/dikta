import type {
  QueryRegistry,
  QueryContract,
  VerificationResult,
} from "@dikta/core";
import { verifyMaxRows, verifyRowFilter, verifyScanStrategy } from "@dikta/core";
import type { ViolationReport, Violation, ViolationKind } from "./types.js";

export function buildViolationReport(
  queries: QueryRegistry,
  sqlMap?: ReadonlyMap<string, string>,
): ViolationReport {
  const violations: Violation[] = [];

  // Source 1: validation errors
  const validationErrors = queries.validate();
  for (const error of validationErrors) {
    violations.push({
      contract: error.query,
      kind: "validation_error",
      expected: "valid contract definition",
      actual: error.field ? `${error.query}.${error.field}: ${error.message}` : error.message,
      suggestion: `Fix the contract definition: ${error.message}`,
    });
  }

  // Source 2: performance conflicts
  const conflicts = queries.detectPerformanceConflicts();
  for (const conflict of conflicts) {
    violations.push({
      contract: conflict.queries.join(", "),
      kind: "performance_conflict",
      expected: "consistent scan strategies per entity",
      actual: conflict.message,
      suggestion: `Align scan strategies for queries on entity "${conflict.field}"`,
    });
  }

  // Source 3: SQL verification (only when sqlMap provided)
  if (sqlMap) {
    for (const contract of queries.list()) {
      const sql = sqlMap.get(contract.name);
      if (!sql) continue;

      appendSqlViolation(violations, contract, verifyMaxRows(sql, contract), "max_rows");
      appendSqlViolation(violations, contract, verifyRowFilter(sql, contract), "row_filter");
      appendSqlViolation(violations, contract, verifyScanStrategy(sql, contract), "scan_strategy");
    }
  }

  return Object.freeze({ violations });
}

function appendSqlViolation(
  violations: Violation[],
  contract: QueryContract,
  result: VerificationResult,
  kind: ViolationKind,
): void {
  if (result.passed) return;

  const suggestion = buildSuggestion(kind, contract);

  violations.push({
    contract: contract.name,
    kind,
    expected: buildExpected(kind, contract),
    actual: result.message,
    suggestion,
    fix_command: "npx dikta verify",
  });
}

function buildExpected(kind: ViolationKind, contract: QueryContract): string {
  switch (kind) {
    case "max_rows":
      return `LIMIT <= ${contract.config.performance?.max_rows ?? "N/A"}`;
    case "row_filter":
      return `WHERE clause referencing "${contract.config.security?.row_filter ?? "N/A"}"`;
    case "scan_strategy":
      return `scan strategy: ${contract.config.performance?.scan_strategy ?? "N/A"}`;
    default:
      return "valid SQL";
  }
}

function buildSuggestion(kind: ViolationKind, contract: QueryContract): string {
  switch (kind) {
    case "max_rows":
      return `Add LIMIT ${contract.config.performance?.max_rows ?? "N"} to the query`;
    case "row_filter":
      return `Add WHERE ${contract.config.security?.row_filter ?? "field"} = $param to the query`;
    case "scan_strategy":
      return `Ensure appropriate indexes exist for ${contract.config.performance?.scan_strategy ?? "index_only"} strategy`;
    default:
      return "Review and fix the SQL implementation";
  }
}

export function serializeViolationReport(report: ViolationReport): string {
  return JSON.stringify(report, null, 2);
}
