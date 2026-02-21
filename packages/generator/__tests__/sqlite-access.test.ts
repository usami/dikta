import { describe, it, expect } from "vitest";
import {
  defineEntity,
  uuid,
  string,
  integer,
  decimal,
  timestamp,
  enumField,
  ref,
  createRegistry,
  defineQuery,
  createQueryRegistry,
} from "@dikta/core";
import { generateAccessLayer } from "../src/targets/sqlite/access.js";

function makeSchema() {
  const Customer = defineEntity({
    name: "Customer",
    fields: {
      id: uuid(),
      name: string({ role: "display_name" }),
      email: string(),
    },
  });

  const Order = defineEntity({
    name: "Order",
    fields: {
      id: uuid(),
      customerId: ref("Customer"),
      status: enumField(["pending", "shipped", "delivered"]),
      totalAmount: decimal({ role: "monetary" }),
      createdAt: timestamp(),
    },
  });

  return createRegistry([Customer, Order]);
}

describe("SQLite generateAccessLayer", () => {
  it("should generate one file per query plus barrel", () => {
    const schema = makeSchema();

    const query = defineQuery("getOrdersByCustomer", {
      purpose: "Fetch orders for a customer",
      from: "Order",
      params: {
        customerId: { type: "uuid", required: true },
      },
      returns: {
        shape: {
          id: "uuid",
          status: "string",
          totalAmount: "decimal",
        },
        ordering: [{ field: "totalAmount", direction: "desc" }],
      },
      performance: { max_rows: 100 },
    });

    const queries = createQueryRegistry([query], schema);
    const files = generateAccessLayer(schema, queries);

    expect(files.length).toBe(2);
    expect(files.some((f) => f.path.includes("get_orders_by_customer"))).toBe(true);
    expect(files.some((f) => f.path.includes("index.ts"))).toBe(true);
  });

  it("should generate params interface with required fields", () => {
    const schema = makeSchema();

    const query = defineQuery("getOrdersByCustomer", {
      purpose: "Fetch orders for a customer",
      from: "Order",
      params: {
        customerId: { type: "uuid", required: true },
      },
      returns: {
        shape: {
          id: "uuid",
          status: "string",
        },
      },
    });

    const queries = createQueryRegistry([query], schema);
    const files = generateAccessLayer(schema, queries);
    const content = files.find((f) => f.path.includes("get_orders_by_customer"))!.content;

    expect(content).toContain("GetOrdersByCustomerParams");
    expect(content).toContain("customerId: string");
  });

  it("should generate result interface", () => {
    const schema = makeSchema();

    const query = defineQuery("getOrdersByCustomer", {
      purpose: "Fetch orders for a customer",
      from: "Order",
      params: {
        customerId: { type: "uuid", required: true },
      },
      returns: {
        shape: {
          id: "uuid",
          status: "string",
          totalAmount: "decimal",
        },
      },
    });

    const queries = createQueryRegistry([query], schema);
    const files = generateAccessLayer(schema, queries);
    const content = files.find((f) => f.path.includes("get_orders_by_customer"))!.content;

    expect(content).toContain("GetOrdersByCustomerResult");
    expect(content).toContain("id: string");
    expect(content).toContain("status: string");
    expect(content).toContain("totalAmount: number");
  });

  it("should use double-quote quoting in SQL", () => {
    const schema = makeSchema();

    const query = defineQuery("getOrdersByCustomer", {
      purpose: "Fetch orders for a customer",
      from: "Order",
      params: {
        customerId: { type: "uuid", required: true },
      },
      returns: {
        shape: {
          id: "uuid",
          status: "string",
        },
      },
    });

    const queries = createQueryRegistry([query], schema);
    const files = generateAccessLayer(schema, queries);
    const content = files.find((f) => f.path.includes("get_orders_by_customer"))!.content;

    expect(content).toContain("SQL_GET_ORDERS_BY_CUSTOMER");
    expect(content).toContain("SELECT");
    expect(content).toContain('FROM "order"');
    expect(content).toContain('"order"."id"');
  });

  it("should use ? placeholders instead of $N", () => {
    const schema = makeSchema();

    const query = defineQuery("getOrdersByCustomer", {
      purpose: "Fetch orders for a customer",
      from: "Order",
      params: {
        customerId: { type: "uuid", required: true },
      },
      returns: {
        shape: { id: "uuid" },
      },
    });

    const queries = createQueryRegistry([query], schema);
    const files = generateAccessLayer(schema, queries);
    const content = files.find((f) => f.path.includes("get_orders_by_customer"))!.content;

    expect(content).toContain("= ?");
    expect(content).not.toContain("$1");
    expect(content).not.toContain("$2");
  });

  it("should import Database from better-sqlite3", () => {
    const schema = makeSchema();

    const query = defineQuery("getOrdersByCustomer", {
      purpose: "Fetch orders for a customer",
      from: "Order",
      params: {
        customerId: { type: "uuid", required: true },
      },
      returns: {
        shape: { id: "uuid" },
      },
    });

    const queries = createQueryRegistry([query], schema);
    const files = generateAccessLayer(schema, queries);
    const content = files.find((f) => f.path.includes("get_orders_by_customer"))!.content;

    expect(content).toContain('import type Database from "better-sqlite3"');
    expect(content).toContain("db: Database");
    expect(content).not.toContain("pool: Pool");
    expect(content).not.toContain("sql: Sql");
  });

  it("should use db.prepare().all() with parameter bindings", () => {
    const schema = makeSchema();

    const query = defineQuery("getOrdersByCustomer", {
      purpose: "Fetch orders for a customer",
      from: "Order",
      params: {
        customerId: { type: "uuid", required: true },
      },
      returns: {
        shape: { id: "uuid" },
      },
    });

    const queries = createQueryRegistry([query], schema);
    const files = generateAccessLayer(schema, queries);
    const content = files.find((f) => f.path.includes("get_orders_by_customer"))!.content;

    expect(content).toContain("db.prepare(SQL_GET_ORDERS_BY_CUSTOMER)");
    expect(content).toContain("stmt.all(params.customerId)");
  });

  it("should generate synchronous function (not async)", () => {
    const schema = makeSchema();

    const query = defineQuery("getOrdersByCustomer", {
      purpose: "Fetch orders for a customer",
      from: "Order",
      params: {
        customerId: { type: "uuid", required: true },
      },
      returns: {
        shape: { id: "uuid" },
      },
    });

    const queries = createQueryRegistry([query], schema);
    const files = generateAccessLayer(schema, queries);
    const content = files.find((f) => f.path.includes("get_orders_by_customer"))!.content;

    expect(content).not.toContain("async function");
    expect(content).toContain("export function");
    expect(content).toContain("db: Database");
  });

  it("should generate LIMIT clause when max_rows specified", () => {
    const schema = makeSchema();

    const query = defineQuery("getOrdersByCustomer", {
      purpose: "Fetch orders for a customer",
      from: "Order",
      params: {
        customerId: { type: "uuid", required: true },
      },
      returns: {
        shape: { id: "uuid" },
      },
      performance: { max_rows: 50 },
    });

    const queries = createQueryRegistry([query], schema);
    const files = generateAccessLayer(schema, queries);
    const content = files.find((f) => f.path.includes("get_orders_by_customer"))!.content;

    expect(content).toContain("LIMIT 50");
  });

  it("should generate ORDER BY clause", () => {
    const schema = makeSchema();

    const query = defineQuery("getOrdersByCustomer", {
      purpose: "Fetch orders for a customer",
      from: "Order",
      params: {
        customerId: { type: "uuid", required: true },
      },
      returns: {
        shape: {
          id: "uuid",
          totalAmount: "decimal",
        },
        ordering: [{ field: "totalAmount", direction: "desc" }],
      },
    });

    const queries = createQueryRegistry([query], schema);
    const files = generateAccessLayer(schema, queries);
    const content = files.find((f) => f.path.includes("get_orders_by_customer"))!.content;

    expect(content).toContain("ORDER BY");
    expect(content).toContain("DESC");
  });

  it("should generate WHERE clause for row_filter", () => {
    const schema = makeSchema();

    const query = defineQuery("getOrdersByCustomer", {
      purpose: "Fetch orders for a customer",
      from: "Order",
      params: {
        customerId: { type: "uuid", required: true },
      },
      returns: {
        shape: { id: "uuid" },
      },
      security: { row_filter: "customerId" },
    });

    const queries = createQueryRegistry([query], schema);
    const files = generateAccessLayer(schema, queries);
    const content = files.find((f) => f.path.includes("get_orders_by_customer"))!.content;

    expect(content).toContain("WHERE");
    expect(content).toContain('"customer_id"');
  });

  it("should generate JOIN with double-quote quoting for cross-entity shape fields", () => {
    const schema = makeSchema();

    const query = defineQuery("getOrdersWithCustomerName", {
      purpose: "Fetch orders with customer name",
      from: "Order",
      returns: {
        shape: {
          id: "uuid",
          customerName: { from: "Customer.name", type: "string" },
        },
      },
      performance: { max_joins: 1 },
    });

    const queries = createQueryRegistry([query], schema);
    const files = generateAccessLayer(schema, queries);
    const content = files.find((f) => f.path.includes("get_orders_with_customer_name"))!.content;

    expect(content).toContain("LEFT JOIN");
    expect(content).toContain('"customer"');
  });

  it("should return boolean as number in result interface", () => {
    const schema = makeSchema();

    const query = defineQuery("getCustomers", {
      purpose: "Fetch all customers",
      from: "Customer",
      returns: {
        shape: {
          id: "uuid",
          name: "string",
        },
      },
    });

    const queries = createQueryRegistry([query], schema);
    const files = generateAccessLayer(schema, queries);
    const content = files.find((f) => f.path.includes("get_customers"))!.content;

    expect(content).toContain("id: string");
    expect(content).toContain("name: string");
  });
});
