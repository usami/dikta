import type { QueryContract } from "./types.js";

export interface VerificationResult {
  readonly passed: boolean;
  readonly message: string;
}

/**
 * Check that a SQL string contains a LIMIT clause consistent with max_rows.
 * Simple regex-based analysis — no DB connection needed.
 */
export function verifyMaxRows(sql: string, contract: QueryContract): VerificationResult {
  const maxRows = contract.config.performance?.max_rows;
  if (maxRows === undefined) {
    return { passed: true, message: "No max_rows constraint defined" };
  }

  const limitMatch = /\bLIMIT\s+(\d+)\b/i.exec(sql);
  if (!limitMatch) {
    return {
      passed: false,
      message: `Query "${contract.name}" requires max_rows=${maxRows} but no LIMIT clause found`,
    };
  }

  const limitValue = Number(limitMatch[1]);
  if (limitValue > maxRows) {
    return {
      passed: false,
      message: `Query "${contract.name}" LIMIT ${limitValue} exceeds max_rows=${maxRows}`,
    };
  }

  return { passed: true, message: `LIMIT ${limitValue} is within max_rows=${maxRows}` };
}

/**
 * Check that a SQL string contains a WHERE clause referencing the security row_filter field.
 */
export function verifyRowFilter(sql: string, contract: QueryContract): VerificationResult {
  const rowFilter = contract.config.security?.row_filter;
  if (!rowFilter) {
    return { passed: true, message: "No row_filter constraint defined" };
  }

  const whereMatch = /\bWHERE\b/i.test(sql);
  if (!whereMatch) {
    return {
      passed: false,
      message: `Query "${contract.name}" requires row_filter="${rowFilter}" but no WHERE clause found`,
    };
  }

  const filterRegex = new RegExp(`\\b${rowFilter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  if (!filterRegex.test(sql)) {
    return {
      passed: false,
      message: `Query "${contract.name}" WHERE clause does not reference row_filter field "${rowFilter}"`,
    };
  }

  return { passed: true, message: `WHERE clause references row_filter "${rowFilter}"` };
}

/**
 * Scan strategy verification — deferred to Phase 3 (requires EXPLAIN analysis).
 */
export function verifyScanStrategy(_sql: string, contract: QueryContract): VerificationResult {
  const strategy = contract.config.performance?.scan_strategy;
  if (!strategy) {
    return { passed: true, message: "No scan_strategy constraint defined" };
  }

  return {
    passed: true,
    message: `Scan strategy "${strategy}" verification deferred to Phase 3 (requires EXPLAIN analysis)`,
  };
}
