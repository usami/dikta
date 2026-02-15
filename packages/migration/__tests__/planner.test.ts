import { describe, it, expect } from "vitest";
import {
  defineEntity,
  createRegistry,
  uuid,
  string,
  integer,
  timestamp,
  boolean,
  decimal,
  enumField,
  ref,
} from "@dikta/core";
import { planMigration } from "../src/planner.js";

function registry(entities: Parameters<typeof createRegistry>[0]) {
  return createRegistry(entities);
}

describe("planMigration", () => {
  it("should return no changes for identical registries", () => {
    const User = defineEntity({
      name: "User",
      fields: { id: uuid({ role: "identifier" }), name: string() },
    });
    const before = registry([User]);
    const after = registry([User]);

    const plan = planMigration(before, after);
    expect(plan.changes).toHaveLength(0);
  });

  it("should detect entity additions", () => {
    const User = defineEntity({
      name: "User",
      fields: { id: uuid({ role: "identifier" }) },
    });
    const Post = defineEntity({
      name: "Post",
      fields: { id: uuid({ role: "identifier" }), title: string() },
    });

    const before = registry([User]);
    const after = registry([User, Post]);

    const plan = planMigration(before, after);
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0]!.kind).toBe("add_entity");
    if (plan.changes[0]!.kind === "add_entity") {
      expect(plan.changes[0]!.entity).toBe("Post");
      expect(Object.keys(plan.changes[0]!.fields)).toEqual(["id", "title"]);
    }
  });

  it("should detect entity removals", () => {
    const User = defineEntity({
      name: "User",
      fields: { id: uuid({ role: "identifier" }) },
    });
    const Post = defineEntity({
      name: "Post",
      fields: { id: uuid({ role: "identifier" }) },
    });

    const before = registry([User, Post]);
    const after = registry([User]);

    const plan = planMigration(before, after);
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0]!.kind).toBe("remove_entity");
  });

  it("should detect field additions", () => {
    const UserV1 = defineEntity({
      name: "User",
      fields: { id: uuid({ role: "identifier" }) },
    });
    const UserV2 = defineEntity({
      name: "User",
      fields: { id: uuid({ role: "identifier" }), email: string() },
    });

    const plan = planMigration(registry([UserV1]), registry([UserV2]));
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0]!.kind).toBe("add_field");
    if (plan.changes[0]!.kind === "add_field") {
      expect(plan.changes[0]!.field).toBe("email");
      expect(plan.changes[0]!.spec.kind).toBe("string");
    }
  });

  it("should detect field removals", () => {
    const UserV1 = defineEntity({
      name: "User",
      fields: { id: uuid({ role: "identifier" }), legacy: string() },
    });
    const UserV2 = defineEntity({
      name: "User",
      fields: { id: uuid({ role: "identifier" }) },
    });

    const plan = planMigration(registry([UserV1]), registry([UserV2]));
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0]!.kind).toBe("remove_field");
  });

  it("should detect field alterations (nullable change)", () => {
    const UserV1 = defineEntity({
      name: "User",
      fields: { id: uuid({ role: "identifier" }), email: string({ nullable: true }) },
    });
    const UserV2 = defineEntity({
      name: "User",
      fields: { id: uuid({ role: "identifier" }), email: string({ nullable: false }) },
    });

    const plan = planMigration(registry([UserV1]), registry([UserV2]));
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0]!.kind).toBe("alter_field");
    if (plan.changes[0]!.kind === "alter_field") {
      expect(plan.changes[0]!.changes.nullable).toEqual({ from: true, to: false });
    }
  });

  it("should detect enum value changes", () => {
    const OrderV1 = defineEntity({
      name: "Order",
      fields: {
        id: uuid({ role: "identifier" }),
        status: enumField(["pending", "shipped"]),
      },
    });
    const OrderV2 = defineEntity({
      name: "Order",
      fields: {
        id: uuid({ role: "identifier" }),
        status: enumField(["pending", "shipped", "delivered"]),
      },
    });

    const plan = planMigration(registry([OrderV1]), registry([OrderV2]));
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0]!.kind).toBe("alter_field");
    if (plan.changes[0]!.kind === "alter_field") {
      expect(plan.changes[0]!.changes.values?.added).toEqual(["delivered"]);
      expect(plan.changes[0]!.changes.values?.removed).toEqual([]);
    }
  });

  it("should detect ref entity changes", () => {
    const CustomerV1 = defineEntity({
      name: "Customer",
      fields: { id: uuid({ role: "identifier" }) },
    });
    const Account = defineEntity({
      name: "Account",
      fields: { id: uuid({ role: "identifier" }) },
    });
    const OrderV1 = defineEntity({
      name: "Order",
      fields: {
        id: uuid({ role: "identifier" }),
        owner: ref("Customer"),
      },
    });
    const OrderV2 = defineEntity({
      name: "Order",
      fields: {
        id: uuid({ role: "identifier" }),
        owner: ref("Account"),
      },
    });

    const plan = planMigration(
      registry([CustomerV1, OrderV1]),
      registry([Account, OrderV2]),
    );

    const alterChange = plan.changes.find(
      (c) => c.kind === "alter_field" && c.entity === "Order",
    );
    expect(alterChange).toBeDefined();
    if (alterChange?.kind === "alter_field") {
      expect(alterChange.changes.entity).toEqual({
        from: "Customer",
        to: "Account",
      });
    }
  });

  it("should detect invariant changes", () => {
    const OrderV1 = defineEntity({
      name: "Order",
      fields: { id: uuid({ role: "identifier" }) },
      invariants: ["total >= 0"],
    });
    const OrderV2 = defineEntity({
      name: "Order",
      fields: { id: uuid({ role: "identifier" }) },
      invariants: ["total >= 0", "quantity > 0"],
    });

    const plan = planMigration(registry([OrderV1]), registry([OrderV2]));
    const invChange = plan.changes.find((c) => c.kind === "add_invariant");
    expect(invChange).toBeDefined();
    if (invChange?.kind === "add_invariant") {
      expect(invChange.invariant).toBe("quantity > 0");
    }
  });

  it("should order removals before alterations before additions", () => {
    const AV1 = defineEntity({
      name: "A",
      fields: { id: uuid({ role: "identifier" }) },
    });
    const BV1 = defineEntity({
      name: "B",
      fields: { id: uuid({ role: "identifier" }), x: string({ nullable: true }) },
    });
    const BV2 = defineEntity({
      name: "B",
      fields: { id: uuid({ role: "identifier" }), x: string({ nullable: false }) },
    });
    const C = defineEntity({
      name: "C",
      fields: { id: uuid({ role: "identifier" }) },
    });

    const plan = planMigration(registry([AV1, BV1]), registry([BV2, C]));

    const kinds = plan.changes.map((c) => c.kind);
    expect(kinds).toEqual(["remove_entity", "alter_field", "add_entity"]);
  });
});
