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
  generateGraphQLOperations,
  generateGraphQLOperationsSchema,
  generateResultType,
  generateConnectionTypes,
  generatePageType,
  queryToGraphQLField,
  paramKindToGraphQL,
  shapeFieldToGraphQL,
} from "../src/graphql/index.js";

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

// ── paramKindToGraphQL ───────────────────────────────────

describe("paramKindToGraphQL", () => {
  it("should map uuid to ID", () => {
    expect(paramKindToGraphQL("uuid")).toBe("ID");
  });

  it("should map string to String", () => {
    expect(paramKindToGraphQL("string")).toBe("String");
  });

  it("should map int to Int", () => {
    expect(paramKindToGraphQL("int")).toBe("Int");
  });

  it("should map decimal to Float", () => {
    expect(paramKindToGraphQL("decimal")).toBe("Float");
  });

  it("should map boolean to Boolean", () => {
    expect(paramKindToGraphQL("boolean")).toBe("Boolean");
  });

  it("should map timestamp to DateTime", () => {
    expect(paramKindToGraphQL("timestamp")).toBe("DateTime");
  });
});

// ── shapeFieldToGraphQL ──────────────────────────────────

describe("shapeFieldToGraphQL", () => {
  it("should map direct ShapeKind uuid to ID", () => {
    expect(shapeFieldToGraphQL("uuid")).toBe("ID");
  });

  it("should map direct ShapeKind string to String", () => {
    expect(shapeFieldToGraphQL("string")).toBe("String");
  });

  it("should map direct ShapeKind integer to Int", () => {
    expect(shapeFieldToGraphQL("integer")).toBe("Int");
  });

  it("should map direct ShapeKind int (alias) to Int", () => {
    expect(shapeFieldToGraphQL("int")).toBe("Int");
  });

  it("should map direct ShapeKind decimal to Float", () => {
    expect(shapeFieldToGraphQL("decimal")).toBe("Float");
  });

  it("should map direct ShapeKind boolean to Boolean", () => {
    expect(shapeFieldToGraphQL("boolean")).toBe("Boolean");
  });

  it("should map direct ShapeKind timestamp to DateTime", () => {
    expect(shapeFieldToGraphQL("timestamp")).toBe("DateTime");
  });

  it("should map JOIN field with explicit type", () => {
    expect(shapeFieldToGraphQL({ from: "Customer.name", type: "string" })).toBe("String");
  });

  it("should map JOIN field with explicit uuid type", () => {
    expect(shapeFieldToGraphQL({ from: "Customer.id", type: "uuid" })).toBe("ID");
  });

  it("should default JOIN field without explicit type to String", () => {
    expect(shapeFieldToGraphQL({ from: "Customer.name" })).toBe("String");
  });
});

// ── generateResultType ───────────────────────────────────

describe("generateResultType", () => {
  it("should generate result type from shape fields", () => {
    const contract = defineQuery("getActiveUsers", {
      purpose: "List active users",
      from: "User",
      returns: {
        shape: { id: "uuid", name: "string", email: "string" },
      },
    });

    const result = generateResultType(contract);

    expect(result).toBe([
      "type GetActiveUsersResult {",
      "  id: ID!",
      "  name: String!",
      "  email: String!",
      "}",
    ].join("\n"));
  });

  it("should handle all shape kinds", () => {
    const contract = defineQuery("getAll", {
      purpose: "Get all fields",
      from: "Entity",
      returns: {
        shape: {
          id: "uuid",
          name: "string",
          amount: "decimal",
          count: "integer",
          qty: "int",
          active: "boolean",
          createdAt: "timestamp",
        },
      },
    });

    const result = generateResultType(contract);

    expect(result).toContain("  id: ID!");
    expect(result).toContain("  name: String!");
    expect(result).toContain("  amount: Float!");
    expect(result).toContain("  count: Int!");
    expect(result).toContain("  qty: Int!");
    expect(result).toContain("  active: Boolean!");
    expect(result).toContain("  createdAt: DateTime!");
  });

  it("should handle JOIN fields", () => {
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

    const result = generateResultType(contract);

    expect(result).toContain("  customer_name: String!");
    expect(result).toContain("  customer_id: ID!");
  });

  it("should PascalCase the query name in type name", () => {
    const contract = defineQuery("get_active_users", {
      purpose: "List active users",
      from: "User",
      returns: { shape: { id: "uuid" } },
    });

    const result = generateResultType(contract);

    expect(result).toMatch(/^type GetActiveUsersResult \{/);
  });
});

// ── generateConnectionTypes ──────────────────────────────

describe("generateConnectionTypes", () => {
  it("should generate Connection and Edge types", () => {
    const contract = defineQuery("listOrders", {
      purpose: "List orders",
      from: "Order",
      returns: {
        shape: { id: "uuid", amount: "decimal" },
        pagination: "cursor",
      },
    });

    const result = generateConnectionTypes(contract);

    expect(result).toContain("type ListOrdersConnection {");
    expect(result).toContain("  edges: [ListOrdersEdge!]!");
    expect(result).toContain("  pageInfo: PageInfo!");
    expect(result).toContain("type ListOrdersEdge {");
    expect(result).toContain("  node: ListOrdersResult!");
    expect(result).toContain("  cursor: String!");
  });
});

// ── generatePageType ─────────────────────────────────────

describe("generatePageType", () => {
  it("should generate Page type with pagination metadata", () => {
    const contract = defineQuery("searchProducts", {
      purpose: "Search products",
      from: "Product",
      returns: {
        shape: { id: "uuid", name: "string" },
        pagination: "offset",
      },
    });

    const result = generatePageType(contract);

    expect(result).toBe([
      "type SearchProductsPage {",
      "  data: [SearchProductsResult!]!",
      "  total: Int!",
      "  limit: Int!",
      "  offset: Int!",
      "}",
    ].join("\n"));
  });
});

// ── queryToGraphQLField ──────────────────────────────────

describe("queryToGraphQLField", () => {
  it("should generate field with no arguments for parameterless query", () => {
    const contract = defineQuery("getAllOrders", {
      purpose: "List all orders",
      from: "Order",
      returns: { shape: { id: "uuid" } },
    });

    const result = queryToGraphQLField(contract);

    expect(result).toBe("  getAllOrders: [GetAllOrdersResult!]!");
  });

  it("should generate field with required argument", () => {
    const contract = defineQuery("getOrderById", {
      purpose: "Get order by ID",
      from: "Order",
      params: {
        id: { type: "uuid", required: true },
      },
      returns: { shape: { id: "uuid", amount: "decimal" } },
    });

    const result = queryToGraphQLField(contract);

    expect(result).toBe("  getOrderById(id: ID!): [GetOrderByIdResult!]!");
  });

  it("should generate field with optional argument", () => {
    const contract = defineQuery("getOrders", {
      purpose: "List orders",
      from: "Order",
      params: {
        status: { type: "string" },
      },
      returns: { shape: { id: "uuid" } },
    });

    const result = queryToGraphQLField(contract);

    expect(result).toBe("  getOrders(status: String): [GetOrdersResult!]!");
  });

  it("should generate field with default value", () => {
    const contract = defineQuery("getOrders", {
      purpose: "List orders",
      from: "Order",
      params: {
        limit: { type: "int", default: 50 },
      },
      returns: { shape: { id: "uuid" } },
    });

    const result = queryToGraphQLField(contract);

    expect(result).toBe("  getOrders(limit: Int = 50): [GetOrdersResult!]!");
  });

  it("should generate field with string default value (quoted)", () => {
    const contract = defineQuery("getOrders", {
      purpose: "List orders",
      from: "Order",
      params: {
        sort: { type: "string", default: "created_at" },
      },
      returns: { shape: { id: "uuid" } },
    });

    const result = queryToGraphQLField(contract);

    expect(result).toContain('sort: String = "created_at"');
  });

  it("should generate field with boolean default value", () => {
    const contract = defineQuery("getUsers", {
      purpose: "List users",
      from: "User",
      params: {
        active: { type: "boolean", default: true },
      },
      returns: { shape: { id: "uuid" } },
    });

    const result = queryToGraphQLField(contract);

    expect(result).toContain("active: Boolean = true");
  });

  it("should generate connection return type for cursor pagination", () => {
    const contract = defineQuery("listOrders", {
      purpose: "List orders",
      from: "Order",
      returns: {
        shape: { id: "uuid" },
        pagination: "cursor",
      },
    });

    const result = queryToGraphQLField(contract);

    expect(result).toBe("  listOrders(cursor: String): ListOrdersConnection!");
  });

  it("should generate page return type for offset pagination", () => {
    const contract = defineQuery("searchProducts", {
      purpose: "Search products",
      from: "Product",
      returns: {
        shape: { id: "uuid" },
        pagination: "offset",
      },
    });

    const result = queryToGraphQLField(contract);

    expect(result).toBe("  searchProducts(limit: Int, offset: Int): SearchProductsPage!");
  });

  it("should not duplicate cursor param if already in contract", () => {
    const contract = defineQuery("listOrders", {
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

    const result = queryToGraphQLField(contract);

    // Should have exactly one cursor arg
    const cursorMatches = result.match(/cursor:/g);
    expect(cursorMatches).toHaveLength(1);
  });

  it("should not duplicate limit/offset params if already in contract", () => {
    const contract = defineQuery("searchProducts", {
      purpose: "Search products",
      from: "Product",
      params: {
        limit: { type: "int", default: 20 },
        offset: { type: "int", default: 0 },
      },
      returns: {
        shape: { id: "uuid" },
        pagination: "offset",
      },
    });

    const result = queryToGraphQLField(contract);

    const limitMatches = result.match(/limit:/g);
    const offsetMatches = result.match(/offset:/g);
    expect(limitMatches).toHaveLength(1);
    expect(offsetMatches).toHaveLength(1);
  });

  it("should handle multiple arguments", () => {
    const contract = defineQuery("getOrdersByStatus", {
      purpose: "Filter orders",
      from: "Order",
      params: {
        status: { type: "string", required: true },
        minAmount: { type: "decimal" },
        active: { type: "boolean", default: true },
      },
      returns: { shape: { id: "uuid" } },
    });

    const result = queryToGraphQLField(contract);

    expect(result).toContain("status: String!");
    expect(result).toContain("minAmount: Float");
    expect(result).toContain("active: Boolean = true");
  });
});

// ── generateGraphQLOperationsSchema ──────────────────────

describe("generateGraphQLOperationsSchema", () => {
  const user = defineEntity({
    name: "User",
    fields: {
      id: uuid(),
      name: string({ role: "display_name" }),
      email: string(),
      active: boolean(),
    },
  });
  const order = defineEntity({
    name: "Order",
    fields: {
      id: uuid(),
      amount: decimal(),
      status: enumField(["pending", "shipped"]),
      userId: ref("User"),
    },
  });

  it("should return empty string for empty query registry", () => {
    const { schema, queries } = makeRegistries([user], []);
    expect(generateGraphQLOperationsSchema(schema, queries)).toBe("");
  });

  it("should generate result type and Query block for simple query", () => {
    const { schema, queries } = makeRegistries(
      [user],
      [["getUsers", {
        purpose: "List users",
        from: "User",
        returns: { shape: { id: "uuid", name: "string" } },
      }]],
    );

    const sdl = generateGraphQLOperationsSchema(schema, queries);

    expect(sdl).toContain("type GetUsersResult {");
    expect(sdl).toContain("  id: ID!");
    expect(sdl).toContain("  name: String!");
    expect(sdl).toContain("type Query {");
    expect(sdl).toContain("  getUsers: [GetUsersResult!]!");
    expect(sdl).not.toContain("PageInfo");
  });

  it("should include PageInfo when cursor pagination is used", () => {
    const { schema, queries } = makeRegistries(
      [user],
      [["listUsers", {
        purpose: "List users",
        from: "User",
        returns: {
          shape: { id: "uuid", name: "string" },
          pagination: "cursor",
        },
      }]],
    );

    const sdl = generateGraphQLOperationsSchema(schema, queries);

    expect(sdl).toContain("type PageInfo {");
    expect(sdl).toContain("  hasNextPage: Boolean!");
    expect(sdl).toContain("  endCursor: String");
    expect(sdl).toContain("type ListUsersConnection {");
    expect(sdl).toContain("type ListUsersEdge {");
    expect(sdl).toContain("type ListUsersResult {");
    expect(sdl).toContain("  listUsers(cursor: String): ListUsersConnection!");
  });

  it("should generate Page type for offset pagination", () => {
    const { schema, queries } = makeRegistries(
      [user],
      [["searchUsers", {
        purpose: "Search users",
        from: "User",
        returns: {
          shape: { id: "uuid", name: "string" },
          pagination: "offset",
        },
      }]],
    );

    const sdl = generateGraphQLOperationsSchema(schema, queries);

    expect(sdl).toContain("type SearchUsersPage {");
    expect(sdl).toContain("  data: [SearchUsersResult!]!");
    expect(sdl).toContain("  total: Int!");
    expect(sdl).toContain("  searchUsers(limit: Int, offset: Int): SearchUsersPage!");
    expect(sdl).not.toContain("PageInfo");
  });

  it("should handle multiple queries with mixed pagination", () => {
    const { schema, queries } = makeRegistries(
      [user, order],
      [
        ["getUsers", {
          purpose: "List users",
          from: "User",
          returns: { shape: { id: "uuid", name: "string" } },
        }],
        ["listOrders", {
          purpose: "List orders",
          from: "Order",
          returns: {
            shape: { id: "uuid", amount: "decimal" },
            pagination: "cursor",
          },
        }],
        ["searchOrders", {
          purpose: "Search orders",
          from: "Order",
          returns: {
            shape: { id: "uuid", amount: "decimal" },
            pagination: "offset",
          },
        }],
      ],
    );

    const sdl = generateGraphQLOperationsSchema(schema, queries);

    // PageInfo present (cursor pagination exists)
    expect(sdl).toContain("type PageInfo {");

    // All result types
    expect(sdl).toContain("type GetUsersResult {");
    expect(sdl).toContain("type ListOrdersResult {");
    expect(sdl).toContain("type SearchOrdersResult {");

    // Connection types for cursor
    expect(sdl).toContain("type ListOrdersConnection {");
    expect(sdl).toContain("type ListOrdersEdge {");

    // Page type for offset
    expect(sdl).toContain("type SearchOrdersPage {");

    // Query type with all fields
    expect(sdl).toContain("type Query {");
    expect(sdl).toContain("  getUsers: [GetUsersResult!]!");
    expect(sdl).toContain("  listOrders(cursor: String): ListOrdersConnection!");
    expect(sdl).toContain("  searchOrders(limit: Int, offset: Int): SearchOrdersPage!");
  });

  it("should order sections correctly: PageInfo, results, wrappers, Query", () => {
    const { schema, queries } = makeRegistries(
      [user],
      [["listUsers", {
        purpose: "List users",
        from: "User",
        returns: {
          shape: { id: "uuid" },
          pagination: "cursor",
        },
      }]],
    );

    const sdl = generateGraphQLOperationsSchema(schema, queries);

    const pageInfoIdx = sdl.indexOf("type PageInfo");
    const resultIdx = sdl.indexOf("type ListUsersResult");
    const connectionIdx = sdl.indexOf("type ListUsersConnection");
    const queryIdx = sdl.indexOf("type Query");

    expect(pageInfoIdx).toBeLessThan(resultIdx);
    expect(resultIdx).toBeLessThan(connectionIdx);
    expect(connectionIdx).toBeLessThan(queryIdx);
  });

  it("should end with newline", () => {
    const { schema, queries } = makeRegistries(
      [user],
      [["getUsers", {
        purpose: "List users",
        from: "User",
        returns: { shape: { id: "uuid" } },
      }]],
    );

    const sdl = generateGraphQLOperationsSchema(schema, queries);

    expect(sdl).toMatch(/\n$/);
  });
});

// ── generateGraphQLOperations (GeneratedFile output) ─────

describe("generateGraphQLOperations", () => {
  const user = defineEntity({
    name: "User",
    fields: {
      id: uuid(),
      name: string({ role: "display_name" }),
      email: string(),
    },
  });
  const order = defineEntity({
    name: "Order",
    fields: {
      id: uuid(),
      amount: decimal(),
      userId: ref("User"),
    },
  });

  it("should generate a single operations.graphql file", () => {
    const { schema, queries } = makeRegistries(
      [user],
      [["getUsers", {
        purpose: "List users",
        from: "User",
        returns: { shape: { id: "uuid", name: "string" } },
      }]],
    );

    const files = generateGraphQLOperations(schema, queries);

    expect(files).toHaveLength(1);
    expect(files[0]!.path).toBe("graphql/operations.graphql");
    expect(files[0]!.purpose).toContain("GraphQL");
    expect(files[0]!.regeneratable).toBe(true);
  });

  it("should return empty array for empty query registry", () => {
    const { schema, queries } = makeRegistries([user], []);
    const files = generateGraphQLOperations(schema, queries);
    expect(files).toHaveLength(0);
  });

  it("should produce valid SDL content with Query type", () => {
    const { schema, queries } = makeRegistries(
      [user, order],
      [
        ["getUsers", {
          purpose: "List users",
          from: "User",
          params: { active: { type: "boolean", required: true } },
          returns: { shape: { id: "uuid", name: "string", email: "string" } },
        }],
        ["getOrderById", {
          purpose: "Get order by ID",
          from: "Order",
          params: { id: { type: "uuid", required: true } },
          returns: { shape: { id: "uuid", amount: "decimal" } },
        }],
      ],
    );

    const files = generateGraphQLOperations(schema, queries);
    const content = files[0]!.content;

    expect(content).toContain("type GetUsersResult {");
    expect(content).toContain("type GetOrderByIdResult {");
    expect(content).toContain("type Query {");
    expect(content).toContain("  getUsers(active: Boolean!): [GetUsersResult!]!");
    expect(content).toContain("  getOrderById(id: ID!): [GetOrderByIdResult!]!");
  });

  it("should handle queries with JOIN shape fields", () => {
    const { schema, queries } = makeRegistries(
      [user, order],
      [["getOrdersWithUser", {
        purpose: "List orders with user name",
        from: "Order",
        returns: {
          shape: {
            id: "uuid",
            amount: "decimal",
            user_name: { from: "User.name", type: "string" },
          },
        },
      }]],
    );

    const files = generateGraphQLOperations(schema, queries);
    const content = files[0]!.content;

    expect(content).toContain("  user_name: String!");
  });

  it("should handle all pagination types in a single schema", () => {
    const { schema, queries } = makeRegistries(
      [user, order],
      [
        ["getUsers", {
          purpose: "List users",
          from: "User",
          returns: { shape: { id: "uuid" } },
        }],
        ["listUsers", {
          purpose: "Paginated users",
          from: "User",
          returns: {
            shape: { id: "uuid", name: "string" },
            pagination: "cursor",
          },
        }],
        ["searchOrders", {
          purpose: "Search orders",
          from: "Order",
          returns: {
            shape: { id: "uuid", amount: "decimal" },
            pagination: "offset",
          },
        }],
      ],
    );

    const files = generateGraphQLOperations(schema, queries);
    const content = files[0]!.content;

    // PageInfo for cursor pagination
    expect(content).toContain("type PageInfo {");

    // Result types for all queries
    expect(content).toContain("type GetUsersResult {");
    expect(content).toContain("type ListUsersResult {");
    expect(content).toContain("type SearchOrdersResult {");

    // Cursor connection types
    expect(content).toContain("type ListUsersConnection {");
    expect(content).toContain("type ListUsersEdge {");

    // Offset page type
    expect(content).toContain("type SearchOrdersPage {");

    // Query type with all fields
    expect(content).toContain("  getUsers: [GetUsersResult!]!");
    expect(content).toContain("  listUsers(cursor: String): ListUsersConnection!");
    expect(content).toContain("  searchOrders(limit: Int, offset: Int): SearchOrdersPage!");
  });
});
