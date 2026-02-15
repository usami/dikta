import { describe, it, expect } from "vitest";
import {
  defineEntity,
  uuid,
  string,
  integer,
  decimal,
  enumField,
  createRegistry,
} from "@dikta/core";
import { generateValidators } from "../src/targets/postgresql/validator.js";

describe("generateValidators", () => {
  it("should skip entities without invariants", () => {
    const entity = defineEntity({
      name: "Simple",
      fields: { id: uuid(), name: string() },
    });
    const schema = createRegistry([entity]);
    const files = generateValidators(schema);
    expect(files).toHaveLength(0);
  });

  it("should generate comparison check for >= invariant", () => {
    const entity = defineEntity({
      name: "Order",
      fields: {
        id: uuid(),
        totalAmount: decimal({ role: "monetary" }),
      },
      invariants: ["totalAmount >= 0"],
    });
    const schema = createRegistry([entity]);
    const files = generateValidators(schema);

    expect(files).toHaveLength(1);
    expect(files[0]!.path).toContain("order.validator.ts");

    const content = files[0]!.content;
    expect(content).toContain("validateOrder");
    expect(content).toContain("totalAmount >= 0");
    expect(content).toContain("entity.totalAmount");
  });

  it("should generate state transition check", () => {
    const entity = defineEntity({
      name: "Order",
      fields: {
        id: uuid(),
        status: enumField(["pending", "shipped", "delivered"]),
      },
      invariants: ["status transitions: pending -> shipped -> delivered"],
    });
    const schema = createRegistry([entity]);
    const files = generateValidators(schema);

    expect(files).toHaveLength(1);
    const content = files[0]!.content;
    expect(content).toContain("previousEntity");
    expect(content).toContain('"pending"');
    expect(content).toContain('"shipped"');
    expect(content).toContain("transitions");
  });

  it("should handle unrecognized invariants with TODO comment", () => {
    const entity = defineEntity({
      name: "Account",
      fields: {
        id: uuid(),
        balance: decimal(),
      },
      invariants: ["balance must be consistent with transaction history"],
    });
    const schema = createRegistry([entity]);
    const files = generateValidators(schema);

    expect(files).toHaveLength(1);
    const content = files[0]!.content;
    expect(content).toContain("TODO");
    expect(content).toContain("balance must be consistent");
  });

  it("should handle multiple invariants in one entity", () => {
    const entity = defineEntity({
      name: "Product",
      fields: {
        id: uuid(),
        price: decimal({ role: "monetary" }),
        quantity: integer({ role: "quantity" }),
      },
      invariants: ["price >= 0", "quantity >= 0"],
    });
    const schema = createRegistry([entity]);
    const files = generateValidators(schema);

    expect(files).toHaveLength(1);
    const content = files[0]!.content;
    expect(content).toContain("price >= 0");
    expect(content).toContain("quantity >= 0");
  });
});
