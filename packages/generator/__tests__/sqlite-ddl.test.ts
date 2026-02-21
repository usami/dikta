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
import { generateDDL } from "../src/targets/sqlite/ddl.js";

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

describe("SQLite generateDDL", () => {
  it("should generate one SQL file per entity plus indexes", () => {
    const schema = makeCustomerOrderSchema();
    const files = generateDDL(schema);

    expect(files.length).toBeGreaterThanOrEqual(2);
    expect(files.some((f) => f.path.includes("customer"))).toBe(true);
    expect(files.some((f) => f.path.includes("order"))).toBe(true);
  });

  it("should order Customer before Order in file numbering", () => {
    const schema = makeCustomerOrderSchema();
    const files = generateDDL(schema);

    const customerFile = files.find((f) => f.path.includes("customer"))!;
    const orderFile = files.find((f) => f.path.includes("order") && !f.path.includes("index"))!;

    expect(customerFile.path < orderFile.path).toBe(true);
  });

  it("should use double-quote quoting", () => {
    const schema = makeCustomerOrderSchema();
    const files = generateDDL(schema);

    const customerSQL = files.find((f) => f.path.includes("customer"))!.content;
    expect(customerSQL).toContain('CREATE TABLE "customer"');
    expect(customerSQL).toContain('"id"');
    expect(customerSQL).toContain('"name"');
  });

  it("should generate CREATE TABLE with SQLite column types", () => {
    const schema = makeCustomerOrderSchema();
    const files = generateDDL(schema);

    const customerSQL = files.find((f) => f.path.includes("customer"))!.content;
    expect(customerSQL).toContain('"id" TEXT NOT NULL PRIMARY KEY');
    expect(customerSQL).toContain('"name" TEXT NOT NULL');
    expect(customerSQL).toContain('"active" INTEGER NOT NULL');
  });

  it("should use REAL for monetary decimal", () => {
    const schema = makeCustomerOrderSchema();
    const files = generateDDL(schema);

    const orderSQL = files.find((f) =>
      f.path.includes("order") && !f.path.includes("index"),
    )!.content;
    expect(orderSQL).toContain("REAL");
  });

  it("should use TEXT for timestamp fields", () => {
    const schema = makeCustomerOrderSchema();
    const files = generateDDL(schema);

    const orderSQL = files.find((f) =>
      f.path.includes("order") && !f.path.includes("index"),
    )!.content;
    expect(orderSQL).toContain('"created_at" TEXT');
    expect(orderSQL).not.toContain("TIMESTAMPTZ");
    expect(orderSQL).not.toContain("DATETIME");
  });

  it("should use CHECK constraint for enum fields", () => {
    const schema = makeCustomerOrderSchema();
    const files = generateDDL(schema);

    const orderSQL = files.find((f) =>
      f.path.includes("order") && !f.path.includes("index"),
    )!.content;
    expect(orderSQL).toContain("CHECK");
    expect(orderSQL).toContain('"chk_order_status"');
    expect(orderSQL).toContain("'pending'");
    expect(orderSQL).toContain("'shipped'");
    expect(orderSQL).toContain("'delivered'");
    expect(orderSQL).not.toContain("ENUM(");
  });

  it("should generate REFERENCES for ref fields with cascade", () => {
    const schema = makeCustomerOrderSchema();
    const files = generateDDL(schema);

    const orderSQL = files.find((f) =>
      f.path.includes("order") && !f.path.includes("index"),
    )!.content;
    expect(orderSQL).toContain('REFERENCES "customer"("id")');
    expect(orderSQL).toContain("ON DELETE CASCADE");
  });

  it("should not include ENGINE=InnoDB or COMMENT ON", () => {
    const schema = makeCustomerOrderSchema();
    const files = generateDDL(schema);

    for (const file of files) {
      expect(file.content).not.toContain("ENGINE=InnoDB");
      expect(file.content).not.toContain("COMMENT ON COLUMN");
    }
  });

  it("should use SQL line comments for PII fields", () => {
    const schema = makeCustomerOrderSchema();
    const files = generateDDL(schema);

    const customerSQL = files.find((f) => f.path.includes("customer"))!.content;
    expect(customerSQL).toContain("-- PII:");
    expect(customerSQL).toContain("customer.email");
  });

  it("should generate FK indexes with double-quote quoting", () => {
    const schema = makeCustomerOrderSchema();
    const files = generateDDL(schema);

    const indexFile = files.find((f) => f.path.includes("indexes"))!;
    expect(indexFile.content).toContain('"idx_order_customer_id"');
    expect(indexFile.content).toContain('ON "order"');
  });

  it("should mark all files as regeneratable", () => {
    const schema = makeCustomerOrderSchema();
    const files = generateDDL(schema);

    for (const file of files) {
      expect(file.regeneratable).toBe(true);
    }
  });
});
