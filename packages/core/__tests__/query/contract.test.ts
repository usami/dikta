import { describe, it, expect } from "vitest";
import { defineQuery } from "../../src/query/contract.js";

describe("defineQuery", () => {
  const validConfig = {
    purpose: "Retrieve active orders for a customer",
    from: "Order",
    params: {
      customer_id: { type: "uuid" as const, required: true as const },
    },
    returns: {
      shape: {
        id: "uuid" as const,
        total_amount: "decimal" as const,
        status: "string" as const,
      },
    },
  } as const;

  it("creates a frozen query contract", () => {
    const query = defineQuery("getActiveOrders", validConfig);

    expect(query.name).toBe("getActiveOrders");
    expect(Object.isFrozen(query)).toBe(true);
    expect(Object.isFrozen(query.config)).toBe(true);
    expect(Object.isFrozen(query.config.returns.shape)).toBe(true);
  });

  it("preserves full config", () => {
    const config = {
      purpose: "List orders with customer names",
      from: "Order",
      params: {
        status: { type: "string" as const, required: false as const, default: "active" },
        limit: { type: "int" as const, default: 50 },
      },
      returns: {
        shape: {
          id: "uuid" as const,
          customer_name: { from: "Customer.name" },
        },
        ordering: [{ field: "id", direction: "asc" as const }],
        pagination: "cursor" as const,
      },
      performance: {
        max_rows: 100,
        scan_strategy: "index_only" as const,
        max_joins: 1,
      },
      security: {
        row_filter: "tenant_id",
        pii_fields: ["customer_name"],
      },
    } as const;

    const query = defineQuery("listOrders", config);

    expect(query.config.purpose).toBe("List orders with customer names");
    expect(query.config.from).toBe("Order");
    expect(query.config.params?.status.default).toBe("active");
    expect(query.config.returns.ordering?.[0]?.field).toBe("id");
    expect(query.config.returns.pagination).toBe("cursor");
    expect(query.config.performance?.max_rows).toBe(100);
    expect(query.config.security?.row_filter).toBe("tenant_id");
  });

  it("defaults performance and security to empty objects", () => {
    const query = defineQuery("simple", {
      purpose: "Simple query",
      from: "Order",
      returns: { shape: { id: "uuid" as const } },
    });

    expect(query.config.performance).toEqual({});
    expect(query.config.security).toEqual({});
  });

  it("throws on empty name", () => {
    expect(() => defineQuery("", validConfig)).toThrow("Query name must not be empty");
  });

  it("throws on empty purpose", () => {
    expect(() =>
      defineQuery("bad", { ...validConfig, purpose: "" }),
    ).toThrow('Query "bad": purpose must not be empty');
  });

  it("throws on empty from", () => {
    expect(() =>
      defineQuery("bad", { ...validConfig, from: "" }),
    ).toThrow('Query "bad": from must not be empty');
  });
});
