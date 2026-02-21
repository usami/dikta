import { describe, it, expect } from "vitest";
import {
  defineEntity,
  uuid,
  string,
  integer,
  decimal,
  boolean,
  timestamp,
  enumField,
  ref,
  createRegistry,
} from "@dikta/core";
import {
  generateGraphQLTypes,
  generateGraphQLSchema,
  entityToGraphQLType,
  fieldToGraphQLType,
  collectEnumTypes,
  toGraphQLEnumValue,
} from "../src/graphql/index.js";

// ── toGraphQLEnumValue ──────────────────────────────────

describe("toGraphQLEnumValue", () => {
  it("should convert lowercase to UPPER_SNAKE_CASE", () => {
    expect(toGraphQLEnumValue("pending")).toBe("PENDING");
  });

  it("should convert camelCase to UPPER_SNAKE_CASE", () => {
    expect(toGraphQLEnumValue("inProgress")).toBe("IN_PROGRESS");
  });

  it("should convert kebab-case to UPPER_SNAKE_CASE", () => {
    expect(toGraphQLEnumValue("in-progress")).toBe("IN_PROGRESS");
  });

  it("should preserve existing UPPER_SNAKE_CASE", () => {
    expect(toGraphQLEnumValue("ALREADY_UPPER")).toBe("ALREADY_UPPER");
  });

  it("should convert snake_case to UPPER_SNAKE_CASE", () => {
    expect(toGraphQLEnumValue("soft_delete")).toBe("SOFT_DELETE");
  });
});

// ── fieldToGraphQLType ──────────────────────────────────

describe("fieldToGraphQLType", () => {
  it("should map uuid to ID! (non-nullable)", () => {
    expect(fieldToGraphQLType(uuid())).toBe("ID!");
  });

  it("should map string to String! (non-nullable)", () => {
    expect(fieldToGraphQLType(string())).toBe("String!");
  });

  it("should map decimal to Float! (non-nullable)", () => {
    expect(fieldToGraphQLType(decimal())).toBe("Float!");
  });

  it("should map integer to Int! (non-nullable)", () => {
    expect(fieldToGraphQLType(integer())).toBe("Int!");
  });

  it("should map boolean to Boolean! (non-nullable)", () => {
    expect(fieldToGraphQLType(boolean())).toBe("Boolean!");
  });

  it("should map timestamp to DateTime! (non-nullable)", () => {
    expect(fieldToGraphQLType(timestamp())).toBe("DateTime!");
  });

  it("should map enum to named enum type when provided", () => {
    expect(fieldToGraphQLType(enumField(["a", "b"]), "OrderStatus")).toBe("OrderStatus!");
  });

  it("should fall back to String for enum without type name", () => {
    expect(fieldToGraphQLType(enumField(["a", "b"]))).toBe("String!");
  });

  it("should map ref to PascalCase entity type", () => {
    expect(fieldToGraphQLType(ref("User"))).toBe("User!");
  });

  it("should PascalCase ref entity names", () => {
    expect(fieldToGraphQLType(ref("orderItem"))).toBe("OrderItem!");
  });

  // ── Nullable handling ──────────────────────────────────

  it("should omit ! for nullable string", () => {
    expect(fieldToGraphQLType(string({ nullable: true }))).toBe("String");
  });

  it("should omit ! for nullable uuid", () => {
    expect(fieldToGraphQLType(uuid({ nullable: true }))).toBe("ID");
  });

  it("should omit ! for nullable ref", () => {
    expect(fieldToGraphQLType(ref("User", { nullable: true }))).toBe("User");
  });

  it("should omit ! for nullable enum with type name", () => {
    expect(fieldToGraphQLType(enumField(["a", "b"], { nullable: true }), "Status")).toBe("Status");
  });

  it("should omit ! for nullable timestamp", () => {
    expect(fieldToGraphQLType(timestamp({ nullable: true }))).toBe("DateTime");
  });
});

// ── collectEnumTypes ────────────────────────────────────

describe("collectEnumTypes", () => {
  it("should collect enums from entity fields", () => {
    const entity = defineEntity({
      name: "Order",
      fields: {
        id: uuid(),
        status: enumField(["pending", "shipped", "delivered"]),
      },
    });

    const enums = collectEnumTypes([entity]);

    expect(enums).toHaveLength(1);
    expect(enums[0]!.name).toBe("OrderStatus");
    expect(enums[0]!.values).toEqual(["pending", "shipped", "delivered"]);
  });

  it("should collect enums from multiple entities", () => {
    const order = defineEntity({
      name: "Order",
      fields: {
        id: uuid(),
        status: enumField(["pending", "shipped"]),
      },
    });
    const user = defineEntity({
      name: "User",
      fields: {
        id: uuid(),
        role: enumField(["admin", "member"]),
      },
    });

    const enums = collectEnumTypes([order, user]);

    expect(enums).toHaveLength(2);
    expect(enums[0]!.name).toBe("OrderStatus");
    expect(enums[1]!.name).toBe("UserRole");
  });

  it("should include description when present", () => {
    const entity = defineEntity({
      name: "Task",
      fields: {
        id: uuid(),
        priority: enumField(["low", "medium", "high"], { description: "Task priority level" }),
      },
    });

    const enums = collectEnumTypes([entity]);

    expect(enums[0]!.description).toBe("Task priority level");
  });

  it("should return empty array when no enums exist", () => {
    const entity = defineEntity({
      name: "User",
      fields: { id: uuid(), name: string() },
    });

    expect(collectEnumTypes([entity])).toHaveLength(0);
  });
});

// ── entityToGraphQLType ─────────────────────────────────

describe("entityToGraphQLType", () => {
  it("should generate a GraphQL Object Type with all fields", () => {
    const entity = defineEntity({
      name: "User",
      fields: {
        id: uuid(),
        name: string({ role: "display_name" }),
        email: string(),
      },
    });

    const result = entityToGraphQLType(entity);

    expect(result).toBe(
      `type User {\n  id: ID!\n  name: String!\n  email: String!\n}`,
    );
  });

  it("should handle nullable fields without !", () => {
    const entity = defineEntity({
      name: "Order",
      fields: {
        id: uuid(),
        notes: string({ nullable: true }),
      },
    });

    const result = entityToGraphQLType(entity);

    expect(result).toContain("notes: String\n");
    expect(result).not.toContain("notes: String!");
  });

  it("should use enum type names for enum fields", () => {
    const entity = defineEntity({
      name: "Order",
      fields: {
        id: uuid(),
        status: enumField(["pending", "shipped"]),
      },
    });

    const result = entityToGraphQLType(entity);

    expect(result).toContain("status: OrderStatus!");
  });

  it("should use referenced entity type for ref fields", () => {
    const entity = defineEntity({
      name: "Order",
      fields: {
        id: uuid(),
        userId: ref("User"),
      },
    });

    const result = entityToGraphQLType(entity);

    expect(result).toContain("userId: User!");
  });

  it("should include field descriptions as GraphQL doc strings", () => {
    const entity = defineEntity({
      name: "User",
      fields: {
        id: uuid(),
        email: string({ description: "Primary email address" }),
      },
    });

    const result = entityToGraphQLType(entity);

    expect(result).toContain('  """Primary email address"""\n  email: String!');
  });

  it("should PascalCase entity names", () => {
    const entity = defineEntity({
      name: "order_item",
      fields: { id: uuid() },
    });

    const result = entityToGraphQLType(entity);

    expect(result).toMatch(/^type OrderItem \{/);
  });
});

// ── generateGraphQLSchema ───────────────────────────────

describe("generateGraphQLSchema", () => {
  it("should include DateTime scalar when timestamp fields exist", () => {
    const entity = defineEntity({
      name: "Event",
      fields: {
        id: uuid(),
        createdAt: timestamp(),
      },
    });
    const registry = createRegistry([entity]);
    const sdl = generateGraphQLSchema(registry);

    expect(sdl).toContain("scalar DateTime");
  });

  it("should omit DateTime scalar when no timestamp fields", () => {
    const entity = defineEntity({
      name: "Tag",
      fields: { id: uuid(), name: string() },
    });
    const registry = createRegistry([entity]);
    const sdl = generateGraphQLSchema(registry);

    expect(sdl).not.toContain("scalar DateTime");
  });

  it("should generate enum types with UPPER_SNAKE_CASE values", () => {
    const entity = defineEntity({
      name: "Order",
      fields: {
        id: uuid(),
        status: enumField(["pending", "inProgress", "shipped"]),
      },
    });
    const registry = createRegistry([entity]);
    const sdl = generateGraphQLSchema(registry);

    expect(sdl).toContain("enum OrderStatus {");
    expect(sdl).toContain("  PENDING");
    expect(sdl).toContain("  IN_PROGRESS");
    expect(sdl).toContain("  SHIPPED");
  });

  it("should generate a complete SDL with scalars, enums, and types", () => {
    const user = defineEntity({
      name: "User",
      fields: {
        id: uuid(),
        name: string(),
        createdAt: timestamp(),
      },
    });
    const order = defineEntity({
      name: "Order",
      fields: {
        id: uuid(),
        userId: ref("User"),
        status: enumField(["pending", "shipped"]),
        total: decimal(),
      },
    });
    const registry = createRegistry([user, order]);
    const sdl = generateGraphQLSchema(registry);

    // Scalar declaration first
    expect(sdl.indexOf("scalar DateTime")).toBeLessThan(sdl.indexOf("enum "));
    // Enums before types
    expect(sdl.indexOf("enum OrderStatus")).toBeLessThan(sdl.indexOf("type User"));
    // Both types present
    expect(sdl).toContain("type User {");
    expect(sdl).toContain("type Order {");
  });

  it("should return empty string for empty registry", () => {
    const registry = createRegistry([]);
    expect(generateGraphQLSchema(registry)).toBe("");
  });
});

// ── generateGraphQLTypes (GeneratedFile output) ─────────

describe("generateGraphQLTypes", () => {
  it("should generate a single schema.graphql file", () => {
    const user = defineEntity({
      name: "User",
      fields: { id: uuid(), name: string() },
    });
    const registry = createRegistry([user]);
    const files = generateGraphQLTypes(registry);

    expect(files).toHaveLength(1);
    expect(files[0]!.path).toBe("graphql/schema.graphql");
    expect(files[0]!.purpose).toContain("GraphQL");
    expect(files[0]!.regeneratable).toBe(true);
  });

  it("should return empty array for empty registry", () => {
    const registry = createRegistry([]);
    const files = generateGraphQLTypes(registry);
    expect(files).toHaveLength(0);
  });

  it("should produce valid GraphQL SDL content", () => {
    const entity = defineEntity({
      name: "User",
      fields: {
        id: uuid(),
        name: string(),
        age: integer({ nullable: true }),
        active: boolean(),
      },
    });
    const registry = createRegistry([entity]);
    const files = generateGraphQLTypes(registry);
    const content = files[0]!.content;

    expect(content).toContain("type User {");
    expect(content).toContain("  id: ID!");
    expect(content).toContain("  name: String!");
    expect(content).toContain("  age: Int");
    expect(content).not.toContain("  age: Int!");
    expect(content).toContain("  active: Boolean!");
    expect(content).toMatch(/\n$/);
  });

  it("should handle all field kinds together", () => {
    const entity = defineEntity({
      name: "AllKinds",
      fields: {
        id: uuid(),
        name: string(),
        price: decimal(),
        qty: integer(),
        active: boolean(),
        createdAt: timestamp(),
        status: enumField(["open", "closed"]),
        ownerId: ref("User"),
      },
    });
    const registry = createRegistry([entity]);
    const files = generateGraphQLTypes(registry);
    const content = files[0]!.content;

    expect(content).toContain("scalar DateTime");
    expect(content).toContain("enum AllKindsStatus {");
    expect(content).toContain("  OPEN");
    expect(content).toContain("  CLOSED");
    expect(content).toContain("type AllKinds {");
    expect(content).toContain("  id: ID!");
    expect(content).toContain("  name: String!");
    expect(content).toContain("  price: Float!");
    expect(content).toContain("  qty: Int!");
    expect(content).toContain("  active: Boolean!");
    expect(content).toContain("  createdAt: DateTime!");
    expect(content).toContain("  status: AllKindsStatus!");
    expect(content).toContain("  ownerId: User!");
  });
});
