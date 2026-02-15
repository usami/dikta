import { describe, it, expect } from "vitest";
import {
  defineEntity,
  createRegistry,
  defineQuery,
  createQueryRegistry,
  uuid,
  string,
  integer,
  timestamp,
  enumField,
  ref,
} from "@dikta/core";
import { generateAgentContext, serializeAgentContext } from "../src/context-generator.js";

function buildFixtures() {
  const Customer = defineEntity({
    name: "Customer",
    fields: {
      id: uuid({ role: "identifier" }),
      email: string({ pii: true, role: "display_name" }),
      name: string({ pii: true }),
      created_at: timestamp(),
    },
    invariants: ["email must be unique"],
  });

  const Product = defineEntity({
    name: "Product",
    fields: {
      id: uuid({ role: "identifier" }),
      name: string({ role: "display_name" }),
      price: integer({ role: "monetary" }),
    },
  });

  const Order = defineEntity({
    name: "Order",
    fields: {
      id: uuid({ role: "identifier" }),
      customer_id: ref("Customer", { cascade: "soft_delete" }),
      product_id: ref("Product"),
      status: enumField(["pending", "paid", "shipped", "cancelled"] as const),
      quantity: integer({ role: "quantity" }),
      created_at: timestamp(),
    },
    invariants: ["quantity must be positive", "status transitions are sequential"],
  });

  const schema = createRegistry([Customer, Product, Order]);

  const findCustomerOrders = defineQuery("findCustomerOrders", {
    purpose: "List orders for a customer",
    from: "Order",
    params: {
      customer_id: { type: "uuid", required: true },
    },
    returns: {
      shape: {
        id: "uuid",
        status: "string",
        quantity: "integer",
        customer_name: { from: "Customer.name" },
      },
    },
    performance: {
      max_rows: 100,
      scan_strategy: "index_only",
      max_joins: 1,
    },
    security: {
      row_filter: "customer_id",
    },
  });

  const getProductById = defineQuery("getProductById", {
    purpose: "Get a single product by ID",
    from: "Product",
    params: {
      id: { type: "uuid", required: true },
    },
    returns: {
      shape: {
        id: "uuid",
        name: "string",
        price: "integer",
      },
    },
    performance: {
      max_rows: 1,
      scan_strategy: "index_only",
    },
  });

  const queries = createQueryRegistry(
    [findCustomerOrders, getProductById],
    schema,
  );

  return { schema, queries, Customer, Product, Order };
}

describe("generateAgentContext", () => {
  it("should extract entity names", () => {
    const { schema, queries } = buildFixtures();
    const ctx = generateAgentContext(schema, queries);

    expect(ctx.schema_summary.entities).toEqual(["Customer", "Product", "Order"]);
  });

  it("should extract relationships as many_to_one", () => {
    const { schema, queries } = buildFixtures();
    const ctx = generateAgentContext(schema, queries);

    expect(ctx.schema_summary.relationships).toEqual([
      { from: "Order", to: "Customer", type: "many_to_one" },
      { from: "Order", to: "Product", type: "many_to_one" },
    ]);
  });

  it("should extract PII fields", () => {
    const { schema, queries } = buildFixtures();
    const ctx = generateAgentContext(schema, queries);

    expect(ctx.schema_summary.pii_fields).toEqual([
      "Customer.email",
      "Customer.name",
    ]);
  });

  it("should count invariants across all entities", () => {
    const { schema, queries } = buildFixtures();
    const ctx = generateAgentContext(schema, queries);

    // Customer: 1, Product: 0, Order: 2
    expect(ctx.schema_summary.invariants_count).toBe(3);
  });

  it("should detect state machines (enum fields with status role)", () => {
    const { schema, queries } = buildFixtures();
    const ctx = generateAgentContext(schema, queries);

    expect(ctx.schema_summary.state_machines).toEqual(["Order.status"]);
  });

  it("should count contracts by entity", () => {
    const { schema, queries } = buildFixtures();
    const ctx = generateAgentContext(schema, queries);

    expect(ctx.contracts_summary.total).toBe(2);
    expect(ctx.contracts_summary.by_entity).toEqual({
      Order: 1,
      Product: 1,
    });
  });

  it("should extract performance budgets", () => {
    const { schema, queries } = buildFixtures();
    const ctx = generateAgentContext(schema, queries);

    expect(ctx.contracts_summary.performance_budgets.index_only_count).toBe(2);
    expect(ctx.contracts_summary.performance_budgets.capped_queries).toEqual([
      { query: "findCustomerOrders", max_rows: 100 },
      { query: "getProductById", max_rows: 1 },
    ]);
  });

  it("should auto-infer policies from registry data", () => {
    const { schema, queries } = buildFixtures();
    const ctx = generateAgentContext(schema, queries);

    // row_filter present -> tenant_isolation
    expect(ctx.policies.tenant_isolation).toBe(true);
    // pii fields present -> pii_logging
    expect(ctx.policies.pii_logging).toBe(true);
    // soft_delete cascade present -> soft_delete
    expect(ctx.policies.soft_delete).toBe(true);
  });

  it("should apply config overrides to policies", () => {
    const { schema, queries } = buildFixtures();
    const ctx = generateAgentContext(schema, queries, {
      policies: { tenant_isolation: false, custom_policy: true },
    });

    expect(ctx.policies.tenant_isolation).toBe(false);
    expect(ctx.policies.custom_policy).toBe(true);
    // non-overridden policies keep auto-inferred values
    expect(ctx.policies.pii_logging).toBe(true);
  });

  it("should provide default generation instructions", () => {
    const { schema, queries } = buildFixtures();
    const ctx = generateAgentContext(schema, queries);

    expect(ctx.generation_instructions).toEqual({
      target_db: "postgresql",
      driver: "postgres.js",
      style: "functions over classes",
      error_handling: "return Result<T, Error> pattern",
    });
  });

  it("should allow overriding generation instructions", () => {
    const { schema, queries } = buildFixtures();
    const ctx = generateAgentContext(schema, queries, {
      generation_instructions: { driver: "pg" },
    });

    expect(ctx.generation_instructions.driver).toBe("pg");
    expect(ctx.generation_instructions.target_db).toBe("postgresql");
  });

  it("should set version to 1.0", () => {
    const { schema, queries } = buildFixtures();
    const ctx = generateAgentContext(schema, queries);

    expect(ctx.version).toBe("1.0");
  });
});

describe("serializeAgentContext", () => {
  it("should produce valid JSON", () => {
    const { schema, queries } = buildFixtures();
    const ctx = generateAgentContext(schema, queries);
    const json = serializeAgentContext(ctx);

    expect(() => JSON.parse(json)).not.toThrow();
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe("1.0");
    expect(parsed.schema_summary.entities).toHaveLength(3);
  });
});
