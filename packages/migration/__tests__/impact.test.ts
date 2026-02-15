import { describe, it, expect } from "vitest";
import {
  defineEntity,
  createRegistry,
  uuid,
  string,
  decimal,
  timestamp,
  enumField,
  ref,
  defineQuery,
  createQueryRegistry,
} from "@dikta/core";
import { analyzeImpact } from "../src/impact.js";
import type { SchemaChange } from "../src/types.js";

// ── Test fixtures ───────────────────────────────────────────

const Customer = defineEntity({
  name: "Customer",
  fields: {
    id: uuid({ role: "identifier" }),
    name: string({ role: "display_name" }),
    email: string({ pii: true }),
    tenant_id: uuid(),
  },
});

const Order = defineEntity({
  name: "Order",
  fields: {
    id: uuid({ role: "identifier" }),
    total: decimal({ role: "monetary" }),
    status: enumField(["pending", "shipped", "delivered"]),
    customer_id: ref("Customer"),
    created_at: timestamp({ role: "audit_timestamp" }),
    tenant_id: uuid(),
  },
});

const schema = createRegistry([Customer, Order]);

const getOrdersByCustomer = defineQuery("getOrdersByCustomer", {
  purpose: "List orders for a customer",
  from: "Order",
  params: {
    customer_id: { type: "uuid", required: true },
  },
  returns: {
    shape: {
      id: "uuid",
      total: "decimal",
      status: "string",
      customer_name: { from: "Customer.name" },
    },
    ordering: [{ field: "id", direction: "desc" }],
  },
  performance: { max_rows: 100, scan_strategy: "index_only" },
  security: { row_filter: "tenant_id", pii_fields: ["email"] },
});

const queries = createQueryRegistry([getOrdersByCustomer], schema);

// ── Tests ───────────────────────────────────────────────────

describe("analyzeImpact", () => {
  it("should detect breaking impact when base entity is removed", () => {
    const changes: SchemaChange[] = [
      { kind: "remove_entity", entity: "Order" },
    ];
    const impact = analyzeImpact(changes, queries, schema);
    expect(impact.contracts).toHaveLength(1);
    expect(impact.contracts[0]!.severity).toBe("breaking");
    expect(impact.contracts[0]!.query).toBe("getOrdersByCustomer");
  });

  it("should detect breaking impact when base entity is renamed", () => {
    const changes: SchemaChange[] = [
      { kind: "rename_entity", from: "Order", to: "PurchaseOrder" },
    ];
    const impact = analyzeImpact(changes, queries, schema);
    expect(impact.contracts[0]!.severity).toBe("breaking");
  });

  it("should detect breaking impact when shape field is removed", () => {
    const changes: SchemaChange[] = [
      { kind: "remove_field", entity: "Order", field: "total" },
    ];
    const impact = analyzeImpact(changes, queries, schema);
    expect(impact.contracts[0]!.severity).toBe("breaking");
    expect(impact.contracts[0]!.reasons[0]).toContain("total");
  });

  it("should detect breaking impact when JOIN target entity is removed", () => {
    const changes: SchemaChange[] = [
      { kind: "remove_entity", entity: "Customer" },
    ];
    const impact = analyzeImpact(changes, queries, schema);
    expect(impact.contracts[0]!.severity).toBe("breaking");
    expect(impact.contracts[0]!.reasons.some((r) => r.includes("Customer"))).toBe(true);
  });

  it("should detect breaking impact when JOIN target field is removed", () => {
    const changes: SchemaChange[] = [
      { kind: "remove_field", entity: "Customer", field: "name" },
    ];
    const impact = analyzeImpact(changes, queries, schema);
    expect(impact.contracts[0]!.severity).toBe("breaking");
  });

  it("should detect breaking impact when row_filter field is removed", () => {
    const changes: SchemaChange[] = [
      { kind: "remove_field", entity: "Order", field: "tenant_id" },
    ];
    const impact = analyzeImpact(changes, queries, schema);
    expect(impact.contracts[0]!.severity).toBe("breaking");
    expect(impact.contracts[0]!.reasons.some((r) => r.includes("Row filter"))).toBe(true);
  });

  it("should detect compatible impact for pii_field removal", () => {
    const changes: SchemaChange[] = [
      { kind: "remove_field", entity: "Order", field: "email" },
    ];
    // "email" appears in pii_fields of the query security config.
    // Even though "email" is not a shape field on Order, the pii_fields check
    // still detects it as a compatible change worth noting.
    const impact = analyzeImpact(changes, queries, schema);
    expect(impact.contracts).toHaveLength(1);
    expect(impact.contracts[0]!.severity).toBe("compatible");
  });

  it("should detect breaking impact for type change on shape field", () => {
    const changes: SchemaChange[] = [
      {
        kind: "alter_field",
        entity: "Order",
        field: "total",
        changes: { kind: { from: "decimal", to: "string" } },
      },
    ];
    const impact = analyzeImpact(changes, queries, schema);
    expect(impact.contracts[0]!.severity).toBe("breaking");
    expect(impact.contracts[0]!.reasons.some((r) => r.includes("type changed"))).toBe(true);
  });

  it("should produce index recommendations for new ref fields", () => {
    const changes: SchemaChange[] = [
      {
        kind: "add_field",
        entity: "Order",
        field: "warehouse_id",
        spec: { kind: "ref", entity: "Warehouse", cascade: "restrict" },
      },
    ];
    const impact = analyzeImpact(changes, queries, schema);
    expect(impact.indexRecommendations).toHaveLength(1);
    expect(impact.indexRecommendations[0]!.action).toBe("add");
    expect(impact.indexRecommendations[0]!.field).toBe("warehouse_id");
  });

  it("should produce backfill requirements for non-nullable fields without backfill", () => {
    const changes: SchemaChange[] = [
      {
        kind: "add_field",
        entity: "Order",
        field: "priority",
        spec: { kind: "integer" },
      },
    ];
    const impact = analyzeImpact(changes, queries, schema);
    expect(impact.backfillRequirements).toHaveLength(1);
    expect(impact.backfillRequirements[0]!.field).toBe("priority");
  });

  it("should not produce backfill requirements for nullable fields", () => {
    const changes: SchemaChange[] = [
      {
        kind: "add_field",
        entity: "Order",
        field: "notes",
        spec: { kind: "string", nullable: true },
      },
    ];
    const impact = analyzeImpact(changes, queries, schema);
    expect(impact.backfillRequirements).toHaveLength(0);
  });

  it("should detect informational impact for invariant changes", () => {
    const changes: SchemaChange[] = [
      { kind: "add_invariant", entity: "Order", invariant: "total >= 0" },
    ];
    const impact = analyzeImpact(changes, queries, schema);
    const orderImpact = impact.contracts.find((c) => c.query === "getOrdersByCustomer");
    expect(orderImpact?.severity).toBe("informational");
  });
});
