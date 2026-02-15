import { describe, it, expect } from "vitest";
import {
  defineEntity,
  uuid,
  string,
  decimal,
  ref,
  createRegistry,
  defineQuery,
  createQueryRegistry,
} from "@dikta/core";
import { generateContractTests } from "../src/targets/postgresql/test.js";

function makeSchema() {
  const Customer = defineEntity({
    name: "Customer",
    fields: {
      id: uuid(),
      name: string({ role: "display_name" }),
    },
  });

  const Order = defineEntity({
    name: "Order",
    fields: {
      id: uuid(),
      customerId: ref("Customer"),
      totalAmount: decimal({ role: "monetary" }),
    },
  });

  return createRegistry([Customer, Order]);
}

describe("generateContractTests", () => {
  it("should return empty for no queries", () => {
    const schema = makeSchema();
    const queries = createQueryRegistry([], schema);
    const files = generateContractTests(queries);
    expect(files).toHaveLength(0);
  });

  it("should generate test file for queries", () => {
    const schema = makeSchema();
    const query = defineQuery("getOrdersByCustomer", {
      purpose: "Fetch orders",
      from: "Order",
      params: { customerId: { type: "uuid", required: true } },
      returns: { shape: { id: "uuid" } },
      performance: { max_rows: 100 },
    });
    const queries = createQueryRegistry([query], schema);
    const files = generateContractTests(queries);

    expect(files).toHaveLength(1);
    expect(files[0]!.path).toBe("tests/contracts.test.ts");
  });

  it("should include max_rows verification test", () => {
    const schema = makeSchema();
    const query = defineQuery("getOrdersByCustomer", {
      purpose: "Fetch orders",
      from: "Order",
      params: { customerId: { type: "uuid", required: true } },
      returns: { shape: { id: "uuid" } },
      performance: { max_rows: 100 },
    });
    const queries = createQueryRegistry([query], schema);
    const files = generateContractTests(queries);

    const content = files[0]!.content;
    expect(content).toContain("verifyMaxRows");
    expect(content).toContain("max_rows=100");
  });

  it("should include row_filter verification test", () => {
    const schema = makeSchema();
    const query = defineQuery("getOrdersByCustomer", {
      purpose: "Fetch orders",
      from: "Order",
      params: { customerId: { type: "uuid", required: true } },
      returns: { shape: { id: "uuid" } },
      security: { row_filter: "customerId" },
    });
    const queries = createQueryRegistry([query], schema);
    const files = generateContractTests(queries);

    const content = files[0]!.content;
    expect(content).toContain("verifyRowFilter");
    expect(content).toContain("row_filter");
  });

  it("should always include SQL structure assertion", () => {
    const schema = makeSchema();
    const query = defineQuery("getOrdersByCustomer", {
      purpose: "Fetch orders",
      from: "Order",
      returns: { shape: { id: "uuid" } },
    });
    const queries = createQueryRegistry([query], schema);
    const files = generateContractTests(queries);

    const content = files[0]!.content;
    expect(content).toContain('toContain("SELECT")');
    expect(content).toContain('toContain("FROM")');
  });
});
