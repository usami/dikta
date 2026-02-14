import { describe, it, expect } from "vitest";
import { defineEntity } from "../../src/entity.js";
import { uuid, string, decimal, integer } from "../../src/fields/primitives.js";
import { ref } from "../../src/fields/ref.js";
import { enumField } from "../../src/fields/enum.js";
import { createRegistry } from "../../src/registry.js";
import { defineQuery } from "../../src/query/contract.js";
import { createQueryRegistry } from "../../src/query/registry.js";

// ── Test fixtures ────────────────────────────────────────────

const customer = defineEntity({
  name: "Customer",
  fields: {
    id: uuid(),
    name: string({ pii: true }),
    email: string({ pii: true }),
    balance: decimal(),
  },
});

const order = defineEntity({
  name: "Order",
  fields: {
    id: uuid(),
    customer_id: ref("Customer", { cascade: "restrict" }),
    total_amount: decimal({ role: "monetary" }),
    item_count: integer({ role: "quantity" }),
    status: enumField(["pending", "shipped", "delivered"]),
  },
});

const entityRegistry = createRegistry([customer, order]);

function makeQuery(name: string, overrides: Record<string, unknown> = {}) {
  return defineQuery(name, {
    purpose: "test",
    from: "Order",
    returns: {
      shape: {
        id: "uuid" as const,
        total_amount: "decimal" as const,
      },
    },
    ...overrides,
  });
}

// ── Tests ────────────────────────────────────────────────────

describe("createQueryRegistry", () => {
  describe("CRUD", () => {
    it("gets contract by name", () => {
      const q = makeQuery("getOrders");
      const registry = createQueryRegistry([q], entityRegistry);
      expect(registry.get("getOrders").name).toBe("getOrders");
    });

    it("lists all contracts", () => {
      const q1 = makeQuery("query1");
      const q2 = makeQuery("query2");
      const registry = createQueryRegistry([q1, q2], entityRegistry);
      expect(registry.list()).toHaveLength(2);
    });

    it("throws actionable error on missing contract", () => {
      const registry = createQueryRegistry([makeQuery("q1")], entityRegistry);
      expect(() => registry.get("nonExistent")).toThrow(
        'Query contract "nonExistent" not found. Available contracts: q1',
      );
    });

    it("throws on duplicate contract names", () => {
      const q1 = makeQuery("dup");
      const q2 = makeQuery("dup");
      expect(() => createQueryRegistry([q1, q2], entityRegistry)).toThrow(
        'Duplicate query contract name: "dup"',
      );
    });
  });

  describe("validate", () => {
    it("returns no errors for valid contracts", () => {
      const q = makeQuery("valid");
      const registry = createQueryRegistry([q], entityRegistry);
      expect(registry.validate()).toHaveLength(0);
    });

    it("detects missing from entity", () => {
      const q = defineQuery("bad", {
        purpose: "test",
        from: "NonExistent",
        returns: { shape: { id: "uuid" } },
      });
      const registry = createQueryRegistry([q], entityRegistry);
      const errors = registry.validate();
      expect(errors).toHaveLength(1);
      expect(errors[0]?.message).toContain('"NonExistent"');
      expect(errors[0]?.message).toContain("does not exist");
    });

    it("detects missing direct field on from entity", () => {
      const q = defineQuery("bad", {
        purpose: "test",
        from: "Order",
        returns: {
          shape: {
            id: "uuid" as const,
            nonexistent_field: "string" as const,
          },
        },
      });
      const registry = createQueryRegistry([q], entityRegistry);
      const errors = registry.validate();
      expect(errors).toHaveLength(1);
      expect(errors[0]?.field).toBe("nonexistent_field");
      expect(errors[0]?.message).toContain("does not exist on entity");
    });

    it("detects missing JOIN target entity", () => {
      const q = defineQuery("bad", {
        purpose: "test",
        from: "Order",
        returns: {
          shape: {
            id: "uuid" as const,
            foo_name: { from: "NonExistent.name" },
          },
        },
      });
      const registry = createQueryRegistry([q], entityRegistry);
      const errors = registry.validate();
      expect(errors.some((e) => e.message.includes("NonExistent"))).toBe(true);
    });

    it("detects missing JOIN target field", () => {
      const q = defineQuery("bad", {
        purpose: "test",
        from: "Order",
        returns: {
          shape: {
            id: "uuid" as const,
            customer_missing: { from: "Customer.nonexistent" },
          },
        },
      });
      const registry = createQueryRegistry([q], entityRegistry);
      const errors = registry.validate();
      expect(errors.some((e) => e.message.includes('"nonexistent"'))).toBe(true);
    });

    it("detects missing relationship path for JOIN", () => {
      // Customer has no ref to itself
      const standalone = defineEntity({
        name: "Standalone",
        fields: { id: uuid(), value: string() },
      });
      const withStandalone = createRegistry([customer, order, standalone]);

      const q = defineQuery("bad", {
        purpose: "test",
        from: "Order",
        returns: {
          shape: {
            id: "uuid" as const,
            standalone_val: { from: "Standalone.value" },
          },
        },
      });
      const registry = createQueryRegistry([q], withStandalone);
      const errors = registry.validate();
      expect(errors.some((e) => e.message.includes("No relationship path"))).toBe(true);
    });

    it("detects ordering field not in shape", () => {
      const q = defineQuery("bad", {
        purpose: "test",
        from: "Order",
        returns: {
          shape: { id: "uuid" as const },
          ordering: [{ field: "nonexistent", direction: "asc" as const }],
        },
      });
      const registry = createQueryRegistry([q], entityRegistry);
      const errors = registry.validate();
      expect(errors.some((e) => e.message.includes("Ordering field"))).toBe(true);
    });

    it("detects max_joins violation", () => {
      const q = defineQuery("bad", {
        purpose: "test",
        from: "Order",
        returns: {
          shape: {
            id: "uuid" as const,
            customer_name: { from: "Customer.name" },
            customer_email: { from: "Customer.email" },
          },
        },
        performance: { max_joins: 1 },
      });
      const registry = createQueryRegistry([q], entityRegistry);
      const errors = registry.validate();
      expect(errors.some((e) => e.message.includes("max_joins"))).toBe(true);
    });
  });

  describe("detectPerformanceConflicts", () => {
    it("detects conflicting scan strategies on same entity", () => {
      const q1 = defineQuery("indexOnly", {
        purpose: "test",
        from: "Order",
        returns: { shape: { id: "uuid" as const } },
        performance: { scan_strategy: "index_only" },
      });
      const q2 = defineQuery("seqScan", {
        purpose: "test",
        from: "Order",
        returns: { shape: { id: "uuid" as const } },
        performance: { scan_strategy: "seq_scan_ok" },
      });
      const registry = createQueryRegistry([q1, q2], entityRegistry);
      const conflicts = registry.detectPerformanceConflicts();
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]?.queries).toContain("indexOnly");
      expect(conflicts[0]?.queries).toContain("seqScan");
    });

    it("returns no conflicts when strategies match", () => {
      const q1 = defineQuery("q1", {
        purpose: "test",
        from: "Order",
        returns: { shape: { id: "uuid" as const } },
        performance: { scan_strategy: "index_only" },
      });
      const q2 = defineQuery("q2", {
        purpose: "test",
        from: "Order",
        returns: { shape: { id: "uuid" as const } },
        performance: { scan_strategy: "index_only" },
      });
      const registry = createQueryRegistry([q1, q2], entityRegistry);
      expect(registry.detectPerformanceConflicts()).toHaveLength(0);
    });

    it("returns no conflicts when no strategies defined", () => {
      const q1 = makeQuery("q1");
      const q2 = makeQuery("q2");
      const registry = createQueryRegistry([q1, q2], entityRegistry);
      expect(registry.detectPerformanceConflicts()).toHaveLength(0);
    });
  });
});
