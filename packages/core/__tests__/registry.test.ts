import { describe, it, expect } from "vitest";
import {
  uuid,
  string,
  ref,
  defineEntity,
  createRegistry,
} from "../src/index.js";

function createTestEntities() {
  const customer = defineEntity({
    name: "Customer",
    fields: {
      id: uuid(),
      name: string({ pii: true }),
      email: string({ pii: true, external_exposure: "restricted" }),
    },
  });

  const order = defineEntity({
    name: "Order",
    fields: {
      id: uuid(),
      customer_id: ref("Customer", { cascade: "restrict" }),
      note: string(),
    },
  });

  return { customer, order };
}

describe("createRegistry", () => {
  it("gets entity by name", () => {
    const { customer, order } = createTestEntities();
    const registry = createRegistry([customer, order]);

    expect(registry.get("Customer").name).toBe("Customer");
    expect(registry.get("Order").name).toBe("Order");
  });

  it("throws actionable error on missing entity", () => {
    const { customer } = createTestEntities();
    const registry = createRegistry([customer]);

    expect(() => registry.get("NonExistent")).toThrow(
      'Entity "NonExistent" not found. Available entities: Customer',
    );
  });

  it("lists all entities", () => {
    const { customer, order } = createTestEntities();
    const registry = createRegistry([customer, order]);

    const list = registry.list();
    expect(list).toHaveLength(2);
    expect(list.map((e) => e.name)).toEqual(["Customer", "Order"]);
  });

  it("detects duplicate entity names", () => {
    const { customer } = createTestEntities();

    expect(() => createRegistry([customer, customer])).toThrow(
      'Duplicate entity name: "Customer"',
    );
  });

  describe("findFieldsWithPolicy", () => {
    it("finds PII fields", () => {
      const { customer, order } = createTestEntities();
      const registry = createRegistry([customer, order]);

      const piiFields = registry.findFieldsWithPolicy("pii", true);
      expect(piiFields).toHaveLength(2);
      expect(piiFields.map((f) => f.field)).toEqual(["name", "email"]);
      expect(piiFields.every((f) => f.entity === "Customer")).toBe(true);
    });

    it("finds fields by exposure policy", () => {
      const { customer, order } = createTestEntities();
      const registry = createRegistry([customer, order]);

      const restricted = registry.findFieldsWithPolicy(
        "external_exposure",
        "restricted",
      );
      expect(restricted).toHaveLength(1);
      expect(restricted[0]!.field).toBe("email");
    });
  });

  describe("getRelationships", () => {
    it("extracts ref fields as relationships", () => {
      const { customer, order } = createTestEntities();
      const registry = createRegistry([customer, order]);

      const relationships = registry.getRelationships();
      expect(relationships).toHaveLength(1);
      expect(relationships[0]).toEqual({
        from: "Order",
        fromField: "customer_id",
        to: "Customer",
        cascade: "restrict",
      });
    });

    it("returns empty for entities with no refs", () => {
      const { customer } = createTestEntities();
      const registry = createRegistry([customer]);

      expect(registry.getRelationships()).toHaveLength(0);
    });
  });
});
