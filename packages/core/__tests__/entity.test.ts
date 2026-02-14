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
} from "../src/index.js";

describe("defineEntity", () => {
  it("creates entity with full order example", () => {
    const order = defineEntity({
      name: "Order",
      fields: {
        id: uuid({ access: "immutable" }),
        customer_id: ref("Customer", { cascade: "restrict" }),
        total_amount: decimal({ role: "monetary", pii: false }),
        item_count: integer({ role: "quantity" }),
        is_paid: boolean(),
        status: enumField(["pending", "processing", "shipped", "delivered", "cancelled"]),
        notes: string({ nullable: true, description: "Free-form order notes" }),
        created_at: timestamp({ access: "immutable" }),
        updated_at: timestamp(),
      },
      invariants: [
        "total_amount >= 0",
        "item_count > 0 when status != 'cancelled'",
      ],
      query_hints: {
        scan_strategy: "index_only",
        expected_row_count: "many",
      },
    });

    expect(order.name).toBe("Order");
    expect(Object.keys(order.fields)).toHaveLength(9);
    expect(order.invariants).toEqual([
      "total_amount >= 0",
      "item_count > 0 when status != 'cancelled'",
    ]);
    expect(order.query_hints).toEqual({
      scan_strategy: "index_only",
      expected_row_count: "many",
    });
  });

  it("defaults invariants to empty array", () => {
    const entity = defineEntity({
      name: "Simple",
      fields: { id: uuid() },
    });
    expect(entity.invariants).toEqual([]);
  });

  it("defaults query_hints to empty object", () => {
    const entity = defineEntity({
      name: "Simple",
      fields: { id: uuid() },
    });
    expect(entity.query_hints).toEqual({});
  });

  it("throws on empty name", () => {
    expect(() =>
      defineEntity({ name: "", fields: { id: uuid() } }),
    ).toThrow("Entity name must not be empty");
  });

  describe("immutability", () => {
    it("entity is frozen", () => {
      const entity = defineEntity({
        name: "Frozen",
        fields: { id: uuid() },
      });
      expect(Object.isFrozen(entity)).toBe(true);
    });

    it("fields object is frozen", () => {
      const entity = defineEntity({
        name: "Frozen",
        fields: { id: uuid() },
      });
      expect(Object.isFrozen(entity.fields)).toBe(true);
    });

    it("invariants array is frozen", () => {
      const entity = defineEntity({
        name: "Frozen",
        fields: { id: uuid() },
        invariants: ["x > 0"],
      });
      expect(Object.isFrozen(entity.invariants)).toBe(true);
    });

    it("query_hints is frozen", () => {
      const entity = defineEntity({
        name: "Frozen",
        fields: { id: uuid() },
        query_hints: { scan_strategy: "index_only" },
      });
      expect(Object.isFrozen(entity.query_hints)).toBe(true);
    });
  });
});
