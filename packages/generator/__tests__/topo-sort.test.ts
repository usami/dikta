import { describe, it, expect } from "vitest";
import {
  defineEntity,
  uuid,
  string,
  ref,
  createRegistry,
} from "@dikta/core";
import { topologicalSort } from "../src/targets/postgresql/topo-sort.js";

function entity(name: string, refs: Record<string, string> = {}) {
  const fields: Record<string, ReturnType<typeof uuid> | ReturnType<typeof string> | ReturnType<typeof ref>> = {
    id: uuid(),
    name: string(),
  };
  for (const [fieldName, target] of Object.entries(refs)) {
    fields[fieldName] = ref(target);
  }
  return defineEntity({ name, fields });
}

describe("topologicalSort", () => {
  it("should return single entity", () => {
    const schema = createRegistry([entity("User")]);
    expect(topologicalSort(schema)).toEqual(["User"]);
  });

  it("should order independent entities alphabetically", () => {
    const schema = createRegistry([
      entity("Zebra"),
      entity("Alpha"),
      entity("Mid"),
    ]);
    expect(topologicalSort(schema)).toEqual(["Alpha", "Mid", "Zebra"]);
  });

  it("should place referenced entity before referencing entity", () => {
    const schema = createRegistry([
      entity("Order", { customerId: "Customer" }),
      entity("Customer"),
    ]);
    const sorted = topologicalSort(schema);
    expect(sorted.indexOf("Customer")).toBeLessThan(sorted.indexOf("Order"));
  });

  it("should handle chain of dependencies", () => {
    const schema = createRegistry([
      entity("OrderItem", { orderId: "Order" }),
      entity("Order", { customerId: "Customer" }),
      entity("Customer"),
    ]);
    const sorted = topologicalSort(schema);
    expect(sorted.indexOf("Customer")).toBeLessThan(sorted.indexOf("Order"));
    expect(sorted.indexOf("Order")).toBeLessThan(sorted.indexOf("OrderItem"));
  });

  it("should throw on circular dependency", () => {
    const schema = createRegistry([
      entity("A", { bId: "B" }),
      entity("B", { aId: "A" }),
    ]);
    expect(() => topologicalSort(schema)).toThrow(/Circular dependency/);
  });

  it("should handle self-referencing entity", () => {
    const schema = createRegistry([
      entity("Category", { parentId: "Category" }),
    ]);
    expect(topologicalSort(schema)).toEqual(["Category"]);
  });
});
