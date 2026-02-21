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
  generateGraphQLResolvers,
  generateResolversFile,
  generateQueryResolver,
  generateEntityResolver,
  collectRefFields,
  collectDataLoaderHints,
  paramKindToTSType,
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

// ── paramKindToTSType ────────────────────────────────────

describe("paramKindToTSType", () => {
  it("should map uuid to string", () => {
    expect(paramKindToTSType("uuid")).toBe("string");
  });

  it("should map string to string", () => {
    expect(paramKindToTSType("string")).toBe("string");
  });

  it("should map int to number", () => {
    expect(paramKindToTSType("int")).toBe("number");
  });

  it("should map decimal to number", () => {
    expect(paramKindToTSType("decimal")).toBe("number");
  });

  it("should map boolean to boolean", () => {
    expect(paramKindToTSType("boolean")).toBe("boolean");
  });

  it("should map timestamp to string", () => {
    expect(paramKindToTSType("timestamp")).toBe("string");
  });
});

// ── collectRefFields ─────────────────────────────────────

describe("collectRefFields", () => {
  it("should collect ref fields from entity", () => {
    const order = defineEntity({
      name: "Order",
      fields: {
        id: uuid(),
        amount: decimal(),
        userId: ref("User"),
      },
    });

    const refs = collectRefFields(order);

    expect(refs).toHaveLength(1);
    expect(refs[0]).toEqual({ fieldName: "userId", targetEntity: "User" });
  });

  it("should collect multiple ref fields", () => {
    const order = defineEntity({
      name: "Order",
      fields: {
        id: uuid(),
        userId: ref("User"),
        productId: ref("Product"),
      },
    });

    const refs = collectRefFields(order);

    expect(refs).toHaveLength(2);
    expect(refs[0]).toEqual({ fieldName: "userId", targetEntity: "User" });
    expect(refs[1]).toEqual({ fieldName: "productId", targetEntity: "Product" });
  });

  it("should return empty array for entity with no ref fields", () => {
    const user = defineEntity({
      name: "User",
      fields: {
        id: uuid(),
        name: string(),
      },
    });

    const refs = collectRefFields(user);

    expect(refs).toHaveLength(0);
  });
});

// ── generateQueryResolver ────────────────────────────────

describe("generateQueryResolver", () => {
  it("should generate resolver stub with required params", () => {
    const contract = defineQuery("getOrderById", {
      purpose: "Get order by ID",
      from: "Order",
      params: {
        id: { type: "uuid", required: true },
      },
      returns: { shape: { id: "uuid", amount: "decimal" } },
    });

    const result = generateQueryResolver(contract);

    expect(result).toContain('// purpose: "Get order by ID"');
    expect(result).toContain("getOrderById: (");
    expect(result).toContain("_parent: unknown,");
    expect(result).toContain("args: { id: string },");
    expect(result).toContain("_ctx: GraphQLContext,");
    expect(result).toContain("// from: Order");
    expect(result).toContain('throw new Error("Not implemented: getOrderById")');
  });

  it("should generate resolver stub with optional params", () => {
    const contract = defineQuery("getOrders", {
      purpose: "List orders",
      from: "Order",
      params: {
        status: { type: "string" },
        limit: { type: "int", default: 50 },
      },
      returns: { shape: { id: "uuid" } },
    });

    const result = generateQueryResolver(contract);

    expect(result).toContain("args: { status?: string; limit?: number },");
  });

  it("should generate resolver stub with mixed required and optional params", () => {
    const contract = defineQuery("getOrdersByStatus", {
      purpose: "Filter orders",
      from: "Order",
      params: {
        tenantId: { type: "uuid", required: true },
        status: { type: "string" },
        active: { type: "boolean", default: true },
      },
      returns: { shape: { id: "uuid" } },
    });

    const result = generateQueryResolver(contract);

    expect(result).toContain("tenantId: string; status?: string; active?: boolean");
  });

  it("should use _args for parameterless query", () => {
    const contract = defineQuery("getAllOrders", {
      purpose: "List all orders",
      from: "Order",
      returns: { shape: { id: "uuid" } },
    });

    const result = generateQueryResolver(contract);

    expect(result).toContain("_args: Record<string, never>,");
  });

  it("should include security comment when row_filter is present", () => {
    const contract = defineQuery("getTenantOrders", {
      purpose: "Tenant-scoped orders",
      from: "Order",
      params: {
        tenantId: { type: "uuid", required: true },
      },
      returns: { shape: { id: "uuid" } },
      security: { row_filter: "tenantId" },
    });

    const result = generateQueryResolver(contract);

    expect(result).toContain('// security: row_filter on "tenantId"');
  });
});

// ── generateEntityResolver ───────────────────────────────

describe("generateEntityResolver", () => {
  it("should generate nested resolver for ref field", () => {
    const order = defineEntity({
      name: "Order",
      fields: {
        id: uuid(),
        amount: decimal(),
        userId: ref("User"),
      },
    });

    const result = generateEntityResolver(order);

    expect(result).toContain("Order: {");
    expect(result).toContain("// Resolve ref: Order.userId → User");
    expect(result).toContain("// DataLoader hint: ctx.loaders.userLoader.load(parent.userId)");
    expect(result).toContain("userId: (");
    expect(result).toContain("parent: { userId: string },");
    expect(result).toContain("_args: unknown,");
    expect(result).toContain("_ctx: GraphQLContext,");
    expect(result).toContain('throw new Error("Not implemented: Order.userId")');
  });

  it("should generate multiple nested resolvers for multiple ref fields", () => {
    const orderItem = defineEntity({
      name: "OrderItem",
      fields: {
        id: uuid(),
        orderId: ref("Order"),
        productId: ref("Product"),
        quantity: integer(),
      },
    });

    const result = generateEntityResolver(orderItem);

    expect(result).toContain("OrderItem: {");
    expect(result).toContain("// Resolve ref: OrderItem.orderId → Order");
    expect(result).toContain("// DataLoader hint: ctx.loaders.orderLoader.load(parent.orderId)");
    expect(result).toContain("orderId: (");
    expect(result).toContain("// Resolve ref: OrderItem.productId → Product");
    expect(result).toContain("// DataLoader hint: ctx.loaders.productLoader.load(parent.productId)");
    expect(result).toContain("productId: (");
  });

  it("should return empty string for entity with no ref fields", () => {
    const user = defineEntity({
      name: "User",
      fields: {
        id: uuid(),
        name: string(),
      },
    });

    const result = generateEntityResolver(user);

    expect(result).toBe("");
  });
});

// ── collectDataLoaderHints ───────────────────────────────

describe("collectDataLoaderHints", () => {
  it("should collect unique DataLoader hints from ref fields", () => {
    const user = defineEntity({
      name: "User",
      fields: { id: uuid(), name: string() },
    });
    const order = defineEntity({
      name: "Order",
      fields: { id: uuid(), userId: ref("User") },
    });
    const schema = createRegistry([user, order]);

    const hints = collectDataLoaderHints(schema);

    expect(hints).toHaveLength(1);
    expect(hints[0]).toContain("userLoader: DataLoader<string, User>");
  });

  it("should deduplicate hints for the same target entity", () => {
    const user = defineEntity({
      name: "User",
      fields: { id: uuid(), name: string() },
    });
    const order = defineEntity({
      name: "Order",
      fields: { id: uuid(), userId: ref("User") },
    });
    const review = defineEntity({
      name: "Review",
      fields: { id: uuid(), userId: ref("User") },
    });
    const schema = createRegistry([user, order, review]);

    const hints = collectDataLoaderHints(schema);

    expect(hints).toHaveLength(1);
  });

  it("should collect hints for multiple target entities", () => {
    const user = defineEntity({
      name: "User",
      fields: { id: uuid(), name: string() },
    });
    const product = defineEntity({
      name: "Product",
      fields: { id: uuid(), name: string() },
    });
    const order = defineEntity({
      name: "Order",
      fields: { id: uuid(), userId: ref("User"), productId: ref("Product") },
    });
    const schema = createRegistry([user, product, order]);

    const hints = collectDataLoaderHints(schema);

    expect(hints).toHaveLength(2);
    expect(hints[0]).toContain("userLoader");
    expect(hints[1]).toContain("productLoader");
  });

  it("should return empty array when no ref fields exist", () => {
    const user = defineEntity({
      name: "User",
      fields: { id: uuid(), name: string() },
    });
    const schema = createRegistry([user]);

    const hints = collectDataLoaderHints(schema);

    expect(hints).toHaveLength(0);
  });
});

// ── generateResolversFile ────────────────────────────────

describe("generateResolversFile", () => {
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

  it("should include file header", () => {
    const { schema, queries } = makeRegistries(
      [user, order],
      [["getUsers", {
        purpose: "List users",
        from: "User",
        returns: { shape: { id: "uuid", name: "string" } },
      }]],
    );

    const content = generateResolversFile(schema, queries);

    expect(content).toContain("AUTO-GENERATED by @dikta/generator");
  });

  it("should include GraphQLContext interface", () => {
    const { schema, queries } = makeRegistries(
      [user, order],
      [["getUsers", {
        purpose: "List users",
        from: "User",
        returns: { shape: { id: "uuid" } },
      }]],
    );

    const content = generateResolversFile(schema, queries);

    expect(content).toContain("export interface GraphQLContext {}");
  });

  it("should include DataLoader hints in context comments", () => {
    const { schema, queries } = makeRegistries(
      [user, order],
      [["getUsers", {
        purpose: "List users",
        from: "User",
        returns: { shape: { id: "uuid" } },
      }]],
    );

    const content = generateResolversFile(schema, queries);

    expect(content).toContain("Suggested DataLoaders for relationship resolution:");
    expect(content).toContain("userLoader: DataLoader<string, User>");
  });

  it("should include query resolvers in Query block", () => {
    const { schema, queries } = makeRegistries(
      [user],
      [["getUsers", {
        purpose: "List users",
        from: "User",
        params: { active: { type: "boolean", required: true } },
        returns: { shape: { id: "uuid", name: "string" } },
      }]],
    );

    const content = generateResolversFile(schema, queries);

    expect(content).toContain("Query: {");
    expect(content).toContain("getUsers: (");
    expect(content).toContain("args: { active: boolean },");
  });

  it("should include entity resolvers for ref fields", () => {
    const { schema, queries } = makeRegistries(
      [user, order],
      [["getOrders", {
        purpose: "List orders",
        from: "Order",
        returns: { shape: { id: "uuid" } },
      }]],
    );

    const content = generateResolversFile(schema, queries);

    expect(content).toContain("Order: {");
    expect(content).toContain("userId: (");
    expect(content).toContain("Resolve ref: Order.userId → User");
  });

  it("should include N+1 prevention comment", () => {
    const { schema, queries } = makeRegistries(
      [user, order],
      [["getOrders", {
        purpose: "List orders",
        from: "Order",
        returns: { shape: { id: "uuid" } },
      }]],
    );

    const content = generateResolversFile(schema, queries);

    expect(content).toContain("Relationship resolvers — use DataLoaders to prevent N+1 queries.");
  });

  it("should handle entities with no ref fields (no entity resolvers section)", () => {
    const { schema, queries } = makeRegistries(
      [user],
      [["getUsers", {
        purpose: "List users",
        from: "User",
        returns: { shape: { id: "uuid" } },
      }]],
    );

    const content = generateResolversFile(schema, queries);

    expect(content).toContain("Query: {");
    expect(content).not.toContain("User: {");
    expect(content).not.toContain("Relationship resolvers");
  });

  it("should handle multiple queries", () => {
    const { schema, queries } = makeRegistries(
      [user, order],
      [
        ["getUsers", {
          purpose: "List users",
          from: "User",
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

    const content = generateResolversFile(schema, queries);

    expect(content).toContain("getUsers: (");
    expect(content).toContain("getOrderById: (");
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

    const content = generateResolversFile(schema, queries);

    expect(content).toMatch(/\n$/);
  });
});

// ── generateGraphQLResolvers (GeneratedFile output) ──────

describe("generateGraphQLResolvers", () => {
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

  it("should generate a single resolvers.ts file", () => {
    const { schema, queries } = makeRegistries(
      [user, order],
      [["getUsers", {
        purpose: "List users",
        from: "User",
        returns: { shape: { id: "uuid", name: "string" } },
      }]],
    );

    const files = generateGraphQLResolvers(schema, queries);

    expect(files).toHaveLength(1);
    expect(files[0]!.path).toBe("graphql/resolvers.ts");
    expect(files[0]!.purpose).toContain("resolver");
    expect(files[0]!.regeneratable).toBe(true);
  });

  it("should return empty array when no queries and no ref fields", () => {
    const simpleEntity = defineEntity({
      name: "User",
      fields: { id: uuid(), name: string() },
    });
    const { schema, queries } = makeRegistries([simpleEntity], []);

    const files = generateGraphQLResolvers(schema, queries);

    expect(files).toHaveLength(0);
  });

  it("should generate resolvers when only ref fields exist (no queries)", () => {
    const { schema, queries } = makeRegistries([user, order], []);

    const files = generateGraphQLResolvers(schema, queries);

    expect(files).toHaveLength(1);
    expect(files[0]!.content).toContain("Order: {");
    expect(files[0]!.content).toContain("userId: (");
    expect(files[0]!.content).not.toContain("Query: {");
  });

  it("should generate resolvers when only queries exist (no ref fields)", () => {
    const { schema, queries } = makeRegistries(
      [user],
      [["getUsers", {
        purpose: "List users",
        from: "User",
        returns: { shape: { id: "uuid" } },
      }]],
    );

    const files = generateGraphQLResolvers(schema, queries);

    expect(files).toHaveLength(1);
    expect(files[0]!.content).toContain("Query: {");
    expect(files[0]!.content).toContain("getUsers: (");
  });

  it("should produce complete resolver file with both query and entity resolvers", () => {
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

    const files = generateGraphQLResolvers(schema, queries);
    const content = files[0]!.content;

    // Context
    expect(content).toContain("export interface GraphQLContext {}");

    // Query resolvers
    expect(content).toContain("Query: {");
    expect(content).toContain("getUsers: (");
    expect(content).toContain("getOrderById: (");

    // Entity resolvers
    expect(content).toContain("Order: {");
    expect(content).toContain("userId: (");
    expect(content).toContain("DataLoader hint");
  });

  it("should handle all param types in resolver args", () => {
    const entity = defineEntity({
      name: "Event",
      fields: {
        id: uuid(),
        name: string(),
        active: boolean(),
        startDate: timestamp(),
      },
    });

    const { schema, queries } = makeRegistries(
      [entity],
      [["searchEvents", {
        purpose: "Search events",
        from: "Event",
        params: {
          id: { type: "uuid", required: true },
          name: { type: "string", required: true },
          count: { type: "int", required: true },
          price: { type: "decimal", required: true },
          active: { type: "boolean", required: true },
          after: { type: "timestamp", required: true },
        },
        returns: { shape: { id: "uuid" } },
      }]],
    );

    const files = generateGraphQLResolvers(schema, queries);
    const content = files[0]!.content;

    expect(content).toContain("id: string");
    expect(content).toContain("name: string");
    expect(content).toContain("count: number");
    expect(content).toContain("price: number");
    expect(content).toContain("active: boolean");
    expect(content).toContain("after: string");
  });
});
