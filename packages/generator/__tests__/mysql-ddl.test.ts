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
import { generateDDL } from "../src/targets/mysql/ddl.js";

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

describe("MySQL generateDDL", () => {
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

  it("should use backtick quoting", () => {
    const schema = makeCustomerOrderSchema();
    const files = generateDDL(schema);

    const customerSQL = files.find((f) => f.path.includes("customer"))!.content;
    expect(customerSQL).toContain("CREATE TABLE `customer`");
    expect(customerSQL).toContain("`id`");
    expect(customerSQL).toContain("`name`");
  });

  it("should generate CREATE TABLE with MySQL column types", () => {
    const schema = makeCustomerOrderSchema();
    const files = generateDDL(schema);

    const customerSQL = files.find((f) => f.path.includes("customer"))!.content;
    expect(customerSQL).toContain("`id` CHAR(36) NOT NULL PRIMARY KEY");
    expect(customerSQL).toContain("`name` VARCHAR(255) NOT NULL");
    expect(customerSQL).toContain("`active` BOOLEAN NOT NULL");
  });

  it("should generate DECIMAL(19,4) for monetary decimal", () => {
    const schema = makeCustomerOrderSchema();
    const files = generateDDL(schema);

    const orderSQL = files.find((f) =>
      f.path.includes("order") && !f.path.includes("index"),
    )!.content;
    expect(orderSQL).toContain("DECIMAL(19,4)");
  });

  it("should use native ENUM() type instead of CHECK constraint", () => {
    const schema = makeCustomerOrderSchema();
    const files = generateDDL(schema);

    const orderSQL = files.find((f) =>
      f.path.includes("order") && !f.path.includes("index"),
    )!.content;
    expect(orderSQL).toContain("ENUM('pending', 'shipped', 'delivered')");
    expect(orderSQL).not.toContain("CHECK");
  });

  it("should generate CONSTRAINT FOREIGN KEY for ref fields", () => {
    const schema = makeCustomerOrderSchema();
    const files = generateDDL(schema);

    const orderSQL = files.find((f) =>
      f.path.includes("order") && !f.path.includes("index"),
    )!.content;
    expect(orderSQL).toContain("CONSTRAINT `fk_order_customer_id`");
    expect(orderSQL).toContain("FOREIGN KEY (`customer_id`)");
    expect(orderSQL).toContain("REFERENCES `customer`(`id`)");
    expect(orderSQL).toContain("ON DELETE CASCADE");
  });

  it("should include ENGINE=InnoDB", () => {
    const schema = makeCustomerOrderSchema();
    const files = generateDDL(schema);

    const customerSQL = files.find((f) => f.path.includes("customer"))!.content;
    expect(customerSQL).toContain("ENGINE=InnoDB");
  });

  it("should use inline COMMENT for PII fields", () => {
    const schema = makeCustomerOrderSchema();
    const files = generateDDL(schema);

    const customerSQL = files.find((f) => f.path.includes("customer"))!.content;
    expect(customerSQL).toContain("COMMENT 'PII:");
    expect(customerSQL).not.toContain("COMMENT ON COLUMN");
  });

  it("should use DATETIME for timestamp fields", () => {
    const schema = makeCustomerOrderSchema();
    const files = generateDDL(schema);

    const orderSQL = files.find((f) =>
      f.path.includes("order") && !f.path.includes("index"),
    )!.content;
    expect(orderSQL).toContain("DATETIME");
    expect(orderSQL).not.toContain("TIMESTAMPTZ");
  });

  it("should generate FK indexes with backtick quoting", () => {
    const schema = makeCustomerOrderSchema();
    const files = generateDDL(schema);

    const indexFile = files.find((f) => f.path.includes("indexes"))!;
    expect(indexFile.content).toContain("`idx_order_customer_id`");
    expect(indexFile.content).toContain("ON `order`");
  });

  it("should mark all files as regeneratable", () => {
    const schema = makeCustomerOrderSchema();
    const files = generateDDL(schema);

    for (const file of files) {
      expect(file.regeneratable).toBe(true);
    }
  });
});
