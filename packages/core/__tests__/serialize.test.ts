import { describe, it, expect } from "vitest";
import {
  uuid,
  string,
  decimal,
  integer,
  boolean,
  timestamp,
  enumField,
  ref,
  defineEntity,
  createRegistry,
  deserializeRegistry,
} from "../src/index.js";

function createTestRegistry() {
  const customer = defineEntity({
    name: "Customer",
    fields: {
      id: uuid({ access: "immutable" }),
      name: string({ pii: true }),
      email: string({ pii: true, external_exposure: "restricted" }),
      tier: enumField(["free", "pro", "enterprise"]),
    },
    invariants: ["email must be unique"],
  });

  const order = defineEntity({
    name: "Order",
    fields: {
      id: uuid({ access: "immutable" }),
      customer_id: ref("Customer", { cascade: "restrict" }),
      total: decimal({ role: "monetary" }),
      quantity: integer({ role: "quantity" }),
      is_paid: boolean(),
      created_at: timestamp({ access: "immutable" }),
      status: enumField(["pending", "shipped", "delivered"]),
    },
    invariants: ["total >= 0"],
    query_hints: { scan_strategy: "index_only" },
  });

  return createRegistry([customer, order]);
}

describe("serialization", () => {
  it("round-trips with full fidelity", () => {
    const original = createTestRegistry();
    const json = original.serialize();
    const restored = deserializeRegistry(json);

    expect(restored.list()).toHaveLength(2);
    expect(restored.get("Customer").name).toBe("Customer");
    expect(restored.get("Order").name).toBe("Order");
  });

  it("preserves enum values", () => {
    const original = createTestRegistry();
    const json = original.serialize();
    const restored = deserializeRegistry(json);

    const tierField = restored.get("Customer").fields["tier"];
    expect(tierField).toBeDefined();
    expect(tierField!.kind).toBe("enum");
    expect((tierField as { values: string[] }).values).toEqual([
      "free",
      "pro",
      "enterprise",
    ]);
  });

  it("preserves ref metadata", () => {
    const original = createTestRegistry();
    const json = original.serialize();
    const restored = deserializeRegistry(json);

    const relationships = restored.getRelationships();
    expect(relationships).toHaveLength(1);
    expect(relationships[0]).toEqual({
      from: "Order",
      fromField: "customer_id",
      to: "Customer",
      cascade: "restrict",
    });
  });

  it("preserves policies", () => {
    const original = createTestRegistry();
    const json = original.serialize();
    const restored = deserializeRegistry(json);

    const piiFields = restored.findFieldsWithPolicy("pii", true);
    expect(piiFields).toHaveLength(2);

    const emailField = piiFields.find((f) => f.field === "email");
    expect(emailField).toBeDefined();
    expect(emailField!.policy.external_exposure).toBe("restricted");
  });

  it("preserves invariants", () => {
    const original = createTestRegistry();
    const json = original.serialize();
    const restored = deserializeRegistry(json);

    expect(restored.get("Customer").invariants).toEqual(["email must be unique"]);
    expect(restored.get("Order").invariants).toEqual(["total >= 0"]);
  });

  it("preserves query hints", () => {
    const original = createTestRegistry();
    const json = original.serialize();
    const restored = deserializeRegistry(json);

    expect(restored.get("Order").query_hints).toEqual({
      scan_strategy: "index_only",
    });
  });

  it("produces valid JSON with version", () => {
    const registry = createTestRegistry();
    const json = registry.serialize();
    const parsed = JSON.parse(json);

    expect(parsed.version).toBe(1);
    expect(parsed.entities).toHaveLength(2);
  });

  it("rejects unsupported version", () => {
    const json = JSON.stringify({ version: 99, entities: [] });
    expect(() => deserializeRegistry(json)).toThrow(
      "Unsupported serialization version: 99. Expected: 1",
    );
  });
});
