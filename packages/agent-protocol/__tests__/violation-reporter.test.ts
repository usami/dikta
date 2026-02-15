import { describe, it, expect } from "vitest";
import {
  defineEntity,
  createRegistry,
  defineQuery,
  createQueryRegistry,
  uuid,
  string,
  integer,
  ref,
} from "@dikta/core";
import { buildViolationReport, serializeViolationReport } from "../src/violation-reporter.js";

function buildValidFixtures() {
  const Customer = defineEntity({
    name: "Customer",
    fields: {
      id: uuid({ role: "identifier" }),
      name: string(),
    },
  });

  const Order = defineEntity({
    name: "Order",
    fields: {
      id: uuid({ role: "identifier" }),
      customer_id: ref("Customer"),
      total: integer({ role: "monetary" }),
    },
  });

  const schema = createRegistry([Customer, Order]);

  const findOrders = defineQuery("findOrders", {
    purpose: "List orders",
    from: "Order",
    params: {
      customer_id: { type: "uuid", required: true },
    },
    returns: {
      shape: {
        id: "uuid",
        total: "integer",
      },
    },
    performance: {
      max_rows: 50,
    },
    security: {
      row_filter: "customer_id",
    },
  });

  const queries = createQueryRegistry([findOrders], schema);
  return { schema, queries };
}

function buildInvalidFixtures() {
  const Customer = defineEntity({
    name: "Customer",
    fields: {
      id: uuid({ role: "identifier" }),
      name: string(),
    },
  });

  const schema = createRegistry([Customer]);

  // This query references a non-existent field on Customer
  const badQuery = defineQuery("badQuery", {
    purpose: "Bad query",
    from: "Customer",
    returns: {
      shape: {
        id: "uuid",
        nonexistent: "string",
      },
    },
  });

  const queries = createQueryRegistry([badQuery], schema);
  return { schema, queries };
}

describe("buildViolationReport", () => {
  it("should return empty violations for valid contracts", () => {
    const { queries } = buildValidFixtures();
    const report = buildViolationReport(queries);

    expect(report.violations).toHaveLength(0);
  });

  it("should detect validation errors", () => {
    const { queries } = buildInvalidFixtures();
    const report = buildViolationReport(queries);

    expect(report.violations.length).toBeGreaterThan(0);
    const validationErrors = report.violations.filter(
      (v) => v.kind === "validation_error",
    );
    expect(validationErrors.length).toBeGreaterThan(0);
    expect(validationErrors[0]!.contract).toBe("badQuery");
  });

  it("should detect max_rows violation from SQL", () => {
    const { queries } = buildValidFixtures();
    const sqlMap = new Map([
      ["findOrders", "SELECT id, total FROM orders WHERE customer_id = $1"],
    ]);

    const report = buildViolationReport(queries, sqlMap);

    const maxRowsViolations = report.violations.filter(
      (v) => v.kind === "max_rows",
    );
    expect(maxRowsViolations).toHaveLength(1);
    expect(maxRowsViolations[0]!.contract).toBe("findOrders");
    expect(maxRowsViolations[0]!.suggestion).toContain("LIMIT");
  });

  it("should detect row_filter violation from SQL", () => {
    const { queries } = buildValidFixtures();
    const sqlMap = new Map([
      ["findOrders", "SELECT id, total FROM orders LIMIT 50"],
    ]);

    const report = buildViolationReport(queries, sqlMap);

    const rowFilterViolations = report.violations.filter(
      (v) => v.kind === "row_filter",
    );
    expect(rowFilterViolations).toHaveLength(1);
    expect(rowFilterViolations[0]!.expected).toContain("customer_id");
  });

  it("should pass when SQL satisfies all constraints", () => {
    const { queries } = buildValidFixtures();
    const sqlMap = new Map([
      ["findOrders", "SELECT id, total FROM orders WHERE customer_id = $1 LIMIT 50"],
    ]);

    const report = buildViolationReport(queries, sqlMap);

    expect(report.violations).toHaveLength(0);
  });

  it("should skip SQL verification for contracts not in sqlMap", () => {
    const { queries } = buildValidFixtures();
    const sqlMap = new Map<string, string>();

    const report = buildViolationReport(queries, sqlMap);

    expect(report.violations).toHaveLength(0);
  });

  it("should include fix_command on SQL violations", () => {
    const { queries } = buildValidFixtures();
    const sqlMap = new Map([
      ["findOrders", "SELECT id, total FROM orders"],
    ]);

    const report = buildViolationReport(queries, sqlMap);

    const sqlViolations = report.violations.filter(
      (v) => v.kind === "max_rows" || v.kind === "row_filter",
    );
    for (const v of sqlViolations) {
      expect(v.fix_command).toBe("npx dikta verify");
    }
  });
});

describe("serializeViolationReport", () => {
  it("should produce valid JSON", () => {
    const { queries } = buildValidFixtures();
    const report = buildViolationReport(queries);
    const json = serializeViolationReport(report);

    expect(() => JSON.parse(json)).not.toThrow();
    const parsed = JSON.parse(json);
    expect(parsed.violations).toBeInstanceOf(Array);
  });
});
