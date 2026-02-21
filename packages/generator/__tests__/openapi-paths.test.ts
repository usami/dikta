import { describe, it, expect } from "vitest";
import {
  defineEntity,
  defineQuery,
  createRegistry,
  createQueryRegistry,
  uuid,
  string,
  integer,
  decimal,
  boolean,
  timestamp,
  enumField,
  ref,
} from "@dikta/core";
import {
  generateOpenAPIPaths,
  queryToPathItem,
  paramKindToJsonSchema,
  shapeFieldToJsonSchema,
} from "../src/openapi/index.js";

// ── Helpers ──────────────────────────────────────────────

function makeRegistries(
  entities: Parameters<typeof createRegistry>[0],
  queries: Parameters<typeof defineQuery>[],
) {
  const schema = createRegistry(entities);
  const contracts = queries.map(([name, config]) => defineQuery(name, config));
  const queryRegistry = createQueryRegistry(contracts, schema);
  return { schema, queries: queryRegistry };
}

// ── paramKindToJsonSchema ────────────────────────────────

describe("paramKindToJsonSchema", () => {
  it("should map uuid to string with uuid format", () => {
    expect(paramKindToJsonSchema("uuid")).toEqual({ type: "string", format: "uuid" });
  });

  it("should map string to string type", () => {
    expect(paramKindToJsonSchema("string")).toEqual({ type: "string" });
  });

  it("should map int to integer type", () => {
    expect(paramKindToJsonSchema("int")).toEqual({ type: "integer" });
  });

  it("should map decimal to number type", () => {
    expect(paramKindToJsonSchema("decimal")).toEqual({ type: "number" });
  });

  it("should map boolean to boolean type", () => {
    expect(paramKindToJsonSchema("boolean")).toEqual({ type: "boolean" });
  });

  it("should map timestamp to string with date-time format", () => {
    expect(paramKindToJsonSchema("timestamp")).toEqual({ type: "string", format: "date-time" });
  });
});

// ── shapeFieldToJsonSchema ───────────────────────────────

describe("shapeFieldToJsonSchema", () => {
  it("should map direct ShapeKind uuid", () => {
    expect(shapeFieldToJsonSchema("uuid")).toEqual({ type: "string", format: "uuid" });
  });

  it("should map direct ShapeKind string", () => {
    expect(shapeFieldToJsonSchema("string")).toEqual({ type: "string" });
  });

  it("should map direct ShapeKind integer", () => {
    expect(shapeFieldToJsonSchema("integer")).toEqual({ type: "integer" });
  });

  it("should map direct ShapeKind int (alias)", () => {
    expect(shapeFieldToJsonSchema("int")).toEqual({ type: "integer" });
  });

  it("should map direct ShapeKind decimal", () => {
    expect(shapeFieldToJsonSchema("decimal")).toEqual({ type: "number" });
  });

  it("should map direct ShapeKind boolean", () => {
    expect(shapeFieldToJsonSchema("boolean")).toEqual({ type: "boolean" });
  });

  it("should map direct ShapeKind timestamp", () => {
    expect(shapeFieldToJsonSchema("timestamp")).toEqual({ type: "string", format: "date-time" });
  });

  it("should map JOIN field with explicit type", () => {
    expect(shapeFieldToJsonSchema({ from: "Customer.name", type: "string" })).toEqual({
      type: "string",
    });
  });

  it("should map JOIN field with explicit uuid type", () => {
    expect(shapeFieldToJsonSchema({ from: "Customer.id", type: "uuid" })).toEqual({
      type: "string",
      format: "uuid",
    });
  });

  it("should default JOIN field without explicit type to string", () => {
    expect(shapeFieldToJsonSchema({ from: "Customer.name" })).toEqual({ type: "string" });
  });
});

// ── queryToPathItem ──────────────────────────────────────

describe("queryToPathItem", () => {
  const order = defineEntity({
    name: "Order",
    fields: {
      id: uuid(),
      amount: decimal(),
      status: enumField(["pending", "shipped"]),
      customerId: ref("Customer"),
    },
  });
  const customer = defineEntity({
    name: "Customer",
    fields: {
      id: uuid(),
      name: string({ role: "display_name" }),
    },
  });

  it("should generate a GET operation with operationId and summary", () => {
    const contract = defineQuery("getOrders", {
      purpose: "List all orders",
      from: "Order",
      returns: {
        shape: { id: "uuid", amount: "decimal" },
      },
    });

    const pathItem = queryToPathItem(contract);

    expect(pathItem).toHaveProperty("get");
    const op = pathItem.get as Record<string, unknown>;
    expect(op.operationId).toBe("getOrders");
    expect(op.summary).toBe("List all orders");
  });

  it("should map params to query parameters", () => {
    const contract = defineQuery("getOrdersByStatus", {
      purpose: "Filter orders by status",
      from: "Order",
      params: {
        status: { type: "string", required: true },
        limit: { type: "int", default: 50 },
      },
      returns: {
        shape: { id: "uuid", amount: "decimal" },
      },
    });

    const pathItem = queryToPathItem(contract);
    const op = pathItem.get as Record<string, unknown>;
    const params = op.parameters as Record<string, unknown>[];

    expect(params).toHaveLength(2);

    const statusParam = params.find((p) => p.name === "status")!;
    expect(statusParam.in).toBe("query");
    expect(statusParam.required).toBe(true);
    expect(statusParam.schema).toEqual({ type: "string" });

    const limitParam = params.find((p) => p.name === "limit")!;
    expect(limitParam.in).toBe("query");
    expect(limitParam.required).toBe(false);
    expect(limitParam.schema).toEqual({ type: "integer", default: 50 });
  });

  it("should detect required uuid 'id' param as path parameter", () => {
    const contract = defineQuery("getOrderById", {
      purpose: "Get order by ID",
      from: "Order",
      params: {
        id: { type: "uuid", required: true },
      },
      returns: {
        shape: { id: "uuid", amount: "decimal" },
      },
    });

    const pathItem = queryToPathItem(contract);
    const op = pathItem.get as Record<string, unknown>;
    const params = op.parameters as Record<string, unknown>[];

    expect(params).toHaveLength(1);
    expect(params[0]!.name).toBe("id");
    expect(params[0]!.in).toBe("path");
    expect(params[0]!.required).toBe(true);
  });

  it("should detect required uuid '{entity}_id' param as path parameter", () => {
    const contract = defineQuery("getOrderByOrderId", {
      purpose: "Get order by order ID",
      from: "Order",
      params: {
        order_id: { type: "uuid", required: true },
      },
      returns: {
        shape: { id: "uuid", amount: "decimal" },
      },
    });

    const pathItem = queryToPathItem(contract);
    const op = pathItem.get as Record<string, unknown>;
    const params = op.parameters as Record<string, unknown>[];

    expect(params[0]!.in).toBe("path");
  });

  it("should keep non-identifier uuid params as query parameters", () => {
    const contract = defineQuery("getOrdersByCustomer", {
      purpose: "Filter orders by customer",
      from: "Order",
      params: {
        customer_id: { type: "uuid", required: true },
      },
      returns: {
        shape: { id: "uuid", amount: "decimal" },
      },
    });

    const pathItem = queryToPathItem(contract);
    const op = pathItem.get as Record<string, unknown>;
    const params = op.parameters as Record<string, unknown>[];

    expect(params[0]!.in).toBe("query");
  });

  it("should build response schema from shape fields", () => {
    const contract = defineQuery("getOrders", {
      purpose: "List orders",
      from: "Order",
      returns: {
        shape: {
          id: "uuid",
          amount: "decimal",
          status: "string",
        },
      },
    });

    const pathItem = queryToPathItem(contract);
    const op = pathItem.get as Record<string, unknown>;
    const responses = op.responses as Record<string, unknown>;
    const ok = responses["200"] as Record<string, unknown>;
    const content = ok.content as Record<string, unknown>;
    const json = content["application/json"] as Record<string, unknown>;
    const schema = json.schema as Record<string, unknown>;

    // No pagination → plain array
    expect(schema.type).toBe("array");
    const items = schema.items as Record<string, unknown>;
    expect(items.type).toBe("object");
    expect(items.properties).toEqual({
      id: { type: "string", format: "uuid" },
      amount: { type: "number" },
      status: { type: "string" },
    });
    expect(items.required).toEqual(["id", "amount", "status"]);
  });

  it("should handle JOIN fields in response schema", () => {
    const contract = defineQuery("getOrdersWithCustomer", {
      purpose: "List orders with customer name",
      from: "Order",
      returns: {
        shape: {
          id: "uuid",
          customer_name: { from: "Customer.name" },
          customer_id: { from: "Customer.id", type: "uuid" },
        },
      },
    });

    const pathItem = queryToPathItem(contract);
    const op = pathItem.get as Record<string, unknown>;
    const responses = op.responses as Record<string, unknown>;
    const schema = ((responses["200"] as any).content["application/json"].schema as Record<string, unknown>);
    const items = schema.items as Record<string, unknown>;

    expect((items.properties as any).customer_name).toEqual({ type: "string" });
    expect((items.properties as any).customer_id).toEqual({ type: "string", format: "uuid" });
  });

  it("should omit parameters when query has none", () => {
    const contract = defineQuery("getAllOrders", {
      purpose: "List all orders",
      from: "Order",
      returns: {
        shape: { id: "uuid" },
      },
    });

    const pathItem = queryToPathItem(contract);
    const op = pathItem.get as Record<string, unknown>;
    expect(op).not.toHaveProperty("parameters");
  });
});

// ── Pagination ───────────────────────────────────────────

describe("pagination", () => {
  it("should generate cursor pagination envelope", () => {
    const contract = defineQuery("getOrders", {
      purpose: "List orders with cursor",
      from: "Order",
      returns: {
        shape: { id: "uuid", amount: "decimal" },
        pagination: "cursor",
      },
    });

    const pathItem = queryToPathItem(contract);
    const op = pathItem.get as Record<string, unknown>;

    // Should add cursor param
    const params = op.parameters as Record<string, unknown>[];
    expect(params).toHaveLength(1);
    expect(params[0]!.name).toBe("cursor");
    expect(params[0]!.in).toBe("query");
    expect(params[0]!.required).toBe(false);

    // Response should use cursor envelope
    const schema = ((op.responses as any)["200"].content["application/json"].schema);
    expect(schema.type).toBe("object");
    expect(schema.properties).toHaveProperty("data");
    expect(schema.properties).toHaveProperty("next_cursor");
    expect(schema.properties).toHaveProperty("has_more");
    expect(schema.properties.data.type).toBe("array");
    expect(schema.required).toEqual(["data", "next_cursor", "has_more"]);
  });

  it("should generate offset pagination envelope", () => {
    const contract = defineQuery("getOrders", {
      purpose: "List orders with offset",
      from: "Order",
      returns: {
        shape: { id: "uuid" },
        pagination: "offset",
      },
    });

    const pathItem = queryToPathItem(contract);
    const op = pathItem.get as Record<string, unknown>;

    // Should add limit and offset params
    const params = op.parameters as Record<string, unknown>[];
    expect(params).toHaveLength(2);
    expect(params.find((p) => p.name === "limit")).toBeDefined();
    expect(params.find((p) => p.name === "offset")).toBeDefined();

    // Response should use offset envelope
    const schema = ((op.responses as any)["200"].content["application/json"].schema);
    expect(schema.type).toBe("object");
    expect(schema.properties).toHaveProperty("data");
    expect(schema.properties).toHaveProperty("total");
    expect(schema.properties).toHaveProperty("limit");
    expect(schema.properties).toHaveProperty("offset");
    expect(schema.required).toEqual(["data", "total", "limit", "offset"]);
  });

  it("should not duplicate pagination params if already in contract", () => {
    const contract = defineQuery("getOrders", {
      purpose: "List orders",
      from: "Order",
      params: {
        cursor: { type: "string" },
      },
      returns: {
        shape: { id: "uuid" },
        pagination: "cursor",
      },
    });

    const pathItem = queryToPathItem(contract);
    const op = pathItem.get as Record<string, unknown>;
    const params = op.parameters as Record<string, unknown>[];

    // Should only have the user-defined cursor param, not a duplicate
    const cursorParams = params.filter((p) => p.name === "cursor");
    expect(cursorParams).toHaveLength(1);
  });
});

// ── generateOpenAPIPaths ─────────────────────────────────

describe("generateOpenAPIPaths", () => {
  const order = defineEntity({
    name: "Order",
    fields: {
      id: uuid(),
      amount: decimal(),
      status: enumField(["pending", "shipped"]),
      customerId: ref("Customer"),
    },
  });
  const customer = defineEntity({
    name: "Customer",
    fields: {
      id: uuid(),
      name: string({ role: "display_name" }),
    },
  });

  it("should generate a single paths.json file", () => {
    const { schema, queries } = makeRegistries(
      [order, customer],
      [["getOrders", {
        purpose: "List orders",
        from: "Order",
        returns: { shape: { id: "uuid", amount: "decimal" } },
      }]],
    );

    const files = generateOpenAPIPaths(schema, queries);

    expect(files).toHaveLength(1);
    expect(files[0]!.path).toBe("openapi/paths.json");
    expect(files[0]!.purpose).toContain("OpenAPI");
    expect(files[0]!.regeneratable).toBe(true);
  });

  it("should return empty array for empty query registry", () => {
    const { schema, queries } = makeRegistries([order, customer], []);
    const files = generateOpenAPIPaths(schema, queries);
    expect(files).toHaveLength(0);
  });

  it("should derive path from entity name", () => {
    const { schema, queries } = makeRegistries(
      [order, customer],
      [["getOrders", {
        purpose: "List orders",
        from: "Order",
        returns: { shape: { id: "uuid" } },
      }]],
    );

    const files = generateOpenAPIPaths(schema, queries);
    const paths = JSON.parse(files[0]!.content);

    expect(paths).toHaveProperty("/orders");
  });

  it("should include path params in path template", () => {
    const { schema, queries } = makeRegistries(
      [order, customer],
      [["getOrderById", {
        purpose: "Get order by ID",
        from: "Order",
        params: { id: { type: "uuid", required: true } },
        returns: { shape: { id: "uuid", amount: "decimal" } },
      }]],
    );

    const files = generateOpenAPIPaths(schema, queries);
    const paths = JSON.parse(files[0]!.content);

    expect(paths).toHaveProperty("/orders/{id}");
  });

  it("should disambiguate when multiple queries share the same path", () => {
    const { schema, queries } = makeRegistries(
      [order, customer],
      [
        ["getActiveOrders", {
          purpose: "List active orders",
          from: "Order",
          returns: { shape: { id: "uuid" } },
        }],
        ["getShippedOrders", {
          purpose: "List shipped orders",
          from: "Order",
          returns: { shape: { id: "uuid" } },
        }],
      ],
    );

    const files = generateOpenAPIPaths(schema, queries);
    const paths = JSON.parse(files[0]!.content);

    // Both would map to /orders, so they get disambiguated
    expect(paths).toHaveProperty("/orders/get-active-orders");
    expect(paths).toHaveProperty("/orders/get-shipped-orders");
    expect(paths).not.toHaveProperty("/orders");
  });

  it("should not disambiguate queries with different path keys", () => {
    const { schema, queries } = makeRegistries(
      [order, customer],
      [
        ["getOrders", {
          purpose: "List orders",
          from: "Order",
          returns: { shape: { id: "uuid" } },
        }],
        ["getOrderById", {
          purpose: "Get order by ID",
          from: "Order",
          params: { id: { type: "uuid", required: true } },
          returns: { shape: { id: "uuid", amount: "decimal" } },
        }],
      ],
    );

    const files = generateOpenAPIPaths(schema, queries);
    const paths = JSON.parse(files[0]!.content);

    // Different path keys → no disambiguation needed
    expect(paths).toHaveProperty("/orders");
    expect(paths).toHaveProperty("/orders/{id}");
  });

  it("should handle multi-word entity names in paths", () => {
    const orderItem = defineEntity({
      name: "OrderItem",
      fields: { id: uuid(), quantity: integer() },
    });

    const { schema, queries } = makeRegistries(
      [orderItem],
      [["getOrderItems", {
        purpose: "List order items",
        from: "OrderItem",
        returns: { shape: { id: "uuid", quantity: "integer" } },
      }]],
    );

    const files = generateOpenAPIPaths(schema, queries);
    const paths = JSON.parse(files[0]!.content);

    expect(paths).toHaveProperty("/order-items");
  });

  it("should produce valid JSON output", () => {
    const { schema, queries } = makeRegistries(
      [order, customer],
      [["getOrders", {
        purpose: "List orders",
        from: "Order",
        returns: { shape: { id: "uuid" } },
      }]],
    );

    const files = generateOpenAPIPaths(schema, queries);
    expect(() => JSON.parse(files[0]!.content)).not.toThrow();
  });

  it("should handle queries across different entities", () => {
    const { schema, queries } = makeRegistries(
      [order, customer],
      [
        ["getOrders", {
          purpose: "List orders",
          from: "Order",
          returns: { shape: { id: "uuid" } },
        }],
        ["getCustomers", {
          purpose: "List customers",
          from: "Customer",
          returns: { shape: { id: "uuid", name: "string" } },
        }],
      ],
    );

    const files = generateOpenAPIPaths(schema, queries);
    const paths = JSON.parse(files[0]!.content);

    expect(paths).toHaveProperty("/orders");
    expect(paths).toHaveProperty("/customers");
  });
});
