import { describe, it, expect } from "vitest";
import { defineQuery } from "../../src/query/contract.js";
import { verifyMaxRows, verifyRowFilter, verifyScanStrategy } from "../../src/query/verifier.js";

// ── Test fixtures ────────────────────────────────────────────

function makeContract(overrides: Record<string, unknown> = {}) {
  return defineQuery("testQuery", {
    purpose: "test",
    from: "Order",
    returns: { shape: { id: "uuid" as const } },
    ...overrides,
  });
}

// ── Tests ────────────────────────────────────────────────────

describe("verifyMaxRows", () => {
  it("passes when LIMIT is within max_rows", () => {
    const contract = makeContract({ performance: { max_rows: 100 } });
    const result = verifyMaxRows("SELECT * FROM orders LIMIT 50", contract);
    expect(result.passed).toBe(true);
    expect(result.message).toContain("within");
  });

  it("passes when LIMIT equals max_rows", () => {
    const contract = makeContract({ performance: { max_rows: 100 } });
    const result = verifyMaxRows("SELECT * FROM orders LIMIT 100", contract);
    expect(result.passed).toBe(true);
  });

  it("fails when no LIMIT clause present", () => {
    const contract = makeContract({ performance: { max_rows: 100 } });
    const result = verifyMaxRows("SELECT * FROM orders", contract);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("no LIMIT clause found");
  });

  it("fails when LIMIT exceeds max_rows", () => {
    const contract = makeContract({ performance: { max_rows: 100 } });
    const result = verifyMaxRows("SELECT * FROM orders LIMIT 200", contract);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("exceeds max_rows");
  });

  it("passes when no max_rows constraint", () => {
    const contract = makeContract();
    const result = verifyMaxRows("SELECT * FROM orders", contract);
    expect(result.passed).toBe(true);
    expect(result.message).toContain("No max_rows constraint");
  });
});

describe("verifyRowFilter", () => {
  it("passes when WHERE references the filter field", () => {
    const contract = makeContract({ security: { row_filter: "tenant_id" } });
    const result = verifyRowFilter(
      "SELECT * FROM orders WHERE tenant_id = $1",
      contract,
    );
    expect(result.passed).toBe(true);
    expect(result.message).toContain("tenant_id");
  });

  it("fails when no WHERE clause present", () => {
    const contract = makeContract({ security: { row_filter: "tenant_id" } });
    const result = verifyRowFilter("SELECT * FROM orders", contract);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("no WHERE clause found");
  });

  it("fails when WHERE does not reference filter field", () => {
    const contract = makeContract({ security: { row_filter: "tenant_id" } });
    const result = verifyRowFilter(
      "SELECT * FROM orders WHERE status = 'active'",
      contract,
    );
    expect(result.passed).toBe(false);
    expect(result.message).toContain("does not reference");
  });

  it("passes when no row_filter constraint", () => {
    const contract = makeContract();
    const result = verifyRowFilter("SELECT * FROM orders", contract);
    expect(result.passed).toBe(true);
    expect(result.message).toContain("No row_filter constraint");
  });
});

describe("verifyScanStrategy", () => {
  it("returns deferred message when strategy is defined", () => {
    const contract = makeContract({
      performance: { scan_strategy: "index_only" },
    });
    const result = verifyScanStrategy("SELECT * FROM orders", contract);
    expect(result.passed).toBe(true);
    expect(result.message).toContain("deferred to Phase 3");
  });

  it("passes when no scan_strategy constraint", () => {
    const contract = makeContract();
    const result = verifyScanStrategy("SELECT * FROM orders", contract);
    expect(result.passed).toBe(true);
    expect(result.message).toContain("No scan_strategy constraint");
  });
});
