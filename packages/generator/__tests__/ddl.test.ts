import { describe, it, expect } from "vitest";
import {
  defineEntity,
  uuid,
  string,
  integer,
  decimal,
  boolean,
  timestamp,
  enumField,
  ref,
  createRegistry,
} from "@dikta/core";
import { generateDDL } from "../src/targets/postgresql/ddl.js";

function makeCustomerOrderSchema() {
  const Customer = defineEntity({
    name: "Customer",
    fields: {
      id: uuid(),
      name: string({ role: "display_name" }),
      email: string({ pii: true }),
      active: boolean(),
    },
  });

  const Order = defineEntity({
    name: "Order",
    fields: {
      id: uuid(),
      customerId: ref("Customer", { cascade: "cascade" }),
      status: enumField(["pending", "shipped", "delivered"]),
      totalAmount: decimal({ role: "monetary" }),
      createdAt: timestamp(),
    },
  });

  return createRegistry([Customer, Order]);
}

describe("generateDDL", () => {
  it("should generate one SQL file per entity plus indexes", () => {
    const schema = makeCustomerOrderSchema();
    const files = generateDDL(schema);

    // Customer + Order tables + indexes
    expect(files.length).toBeGreaterThanOrEqual(2);
    expect(files.some((f) => f.path.includes("customer"))).toBe(true);
    expect(files.some((f) => f.path.includes("order"))).toBe(true);
  });

  it("should order Customer before Order in file numbering", () => {
    const schema = makeCustomerOrderSchema();
    const files = generateDDL(schema);

    const customerFile = files.find((f) => f.path.includes("customer"))!;
    const orderFile = files.find((f) => f.path.includes("order") && !f.path.includes("index"))!;

    // Customer should come first (lower number)
    expect(customerFile.path < orderFile.path).toBe(true);
  });

  it("should generate CREATE TABLE with correct column types", () => {
    const schema = makeCustomerOrderSchema();
    const files = generateDDL(schema);

    const customerSQL = files.find((f) => f.path.includes("customer"))!.content;
    expect(customerSQL).toContain('CREATE TABLE "customer"');
    expect(customerSQL).toContain('"id" UUID NOT NULL PRIMARY KEY');
    expect(customerSQL).toContain('"name" TEXT NOT NULL');
    expect(customerSQL).toContain('"email" TEXT NOT NULL');
    expect(customerSQL).toContain('"active" BOOLEAN NOT NULL');
  });

  it("should generate NUMERIC(19,4) for monetary decimal", () => {
    const schema = makeCustomerOrderSchema();
    const files = generateDDL(schema);

    const orderSQL = files.find((f) =>
      f.path.includes("order") && !f.path.includes("index"),
    )!.content;
    expect(orderSQL).toContain("NUMERIC(19,4)");
  });

  it("should generate CHECK constraint for enum fields", () => {
    const schema = makeCustomerOrderSchema();
    const files = generateDDL(schema);

    const orderSQL = files.find((f) =>
      f.path.includes("order") && !f.path.includes("index"),
    )!.content;
    expect(orderSQL).toContain("CHECK");
    expect(orderSQL).toContain("'pending'");
    expect(orderSQL).toContain("'shipped'");
    expect(orderSQL).toContain("'delivered'");
  });

  it("should generate REFERENCES for ref fields", () => {
    const schema = makeCustomerOrderSchema();
    const files = generateDDL(schema);

    const orderSQL = files.find((f) =>
      f.path.includes("order") && !f.path.includes("index"),
    )!.content;
    expect(orderSQL).toContain('REFERENCES "customer"(id)');
    expect(orderSQL).toContain("ON DELETE CASCADE");
  });

  it("should generate PII comment", () => {
    const schema = makeCustomerOrderSchema();
    const files = generateDDL(schema);

    const customerSQL = files.find((f) => f.path.includes("customer"))!.content;
    expect(customerSQL).toContain("COMMENT ON COLUMN");
    expect(customerSQL).toContain("PII");
  });

  it("should generate FK indexes", () => {
    const schema = makeCustomerOrderSchema();
    const files = generateDDL(schema);

    const indexFile = files.find((f) => f.path.includes("indexes"))!;
    expect(indexFile.content).toContain("idx_order_customer_id");
  });

  it("should mark all files as regeneratable", () => {
    const schema = makeCustomerOrderSchema();
    const files = generateDDL(schema);

    for (const file of files) {
      expect(file.regeneratable).toBe(true);
    }
  });
});
