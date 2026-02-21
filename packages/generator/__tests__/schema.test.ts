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
import { generateSchemas, generateEntitySchema, fieldKindToZod } from "../src/schema.js";

describe("fieldKindToZod", () => {
  it("should map uuid to z.string().uuid()", () => {
    expect(fieldKindToZod(uuid())).toBe("z.string().uuid()");
  });

  it("should map string to z.string()", () => {
    expect(fieldKindToZod(string())).toBe("z.string()");
  });

  it("should map decimal to z.number()", () => {
    expect(fieldKindToZod(decimal())).toBe("z.number()");
  });

  it("should map integer to z.number().int()", () => {
    expect(fieldKindToZod(integer())).toBe("z.number().int()");
  });

  it("should map boolean to z.boolean()", () => {
    expect(fieldKindToZod(boolean())).toBe("z.boolean()");
  });

  it("should map timestamp to z.coerce.date()", () => {
    expect(fieldKindToZod(timestamp())).toBe("z.coerce.date()");
  });

  it("should map enum to z.enum([...values])", () => {
    expect(fieldKindToZod(enumField(["pending", "shipped", "delivered"]))).toBe(
      'z.enum(["pending", "shipped", "delivered"])',
    );
  });

  it("should map ref to z.string().uuid()", () => {
    expect(fieldKindToZod(ref("User"))).toBe("z.string().uuid()");
  });

  it("should append .nullable() for nullable fields", () => {
    expect(fieldKindToZod(string({ nullable: true }))).toBe("z.string().nullable()");
  });

  it("should append .nullable() to enum fields", () => {
    expect(fieldKindToZod(enumField(["a", "b"], { nullable: true }))).toBe(
      'z.enum(["a", "b"]).nullable()',
    );
  });

  it("should append .nullable() to ref fields", () => {
    expect(fieldKindToZod(ref("User", { nullable: true }))).toBe(
      "z.string().uuid().nullable()",
    );
  });
});

describe("generateEntitySchema", () => {
  it("should generate a valid schema file for a simple entity", () => {
    const entity = defineEntity({
      name: "User",
      fields: {
        id: uuid(),
        name: string({ role: "display_name" }),
        email: string(),
      },
    });

    const file = generateEntitySchema(entity);

    expect(file.path).toBe("schemas/user.schema.ts");
    expect(file.purpose).toContain("User");
    expect(file.regeneratable).toBe(true);

    expect(file.content).toContain('import { z } from "zod"');
    expect(file.content).toContain("export const UserSchema = z.object({");
    expect(file.content).toContain("id: z.string().uuid(),");
    expect(file.content).toContain("name: z.string(),");
    expect(file.content).toContain("email: z.string(),");
    expect(file.content).toContain("export type User = z.infer<typeof UserSchema>;");
    expect(file.content).toContain("export const parseUser = UserSchema.parse.bind(UserSchema);");
    expect(file.content).toContain("export const safeParseUser = UserSchema.safeParse.bind(UserSchema);");
  });

  it("should handle entities with all field kinds", () => {
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

    const file = generateEntitySchema(entity);

    expect(file.content).toContain("id: z.string().uuid(),");
    expect(file.content).toContain("name: z.string(),");
    expect(file.content).toContain("price: z.number(),");
    expect(file.content).toContain("qty: z.number().int(),");
    expect(file.content).toContain("active: z.boolean(),");
    expect(file.content).toContain("createdAt: z.coerce.date(),");
    expect(file.content).toContain('status: z.enum(["open", "closed"]),');
    expect(file.content).toContain("ownerId: z.string().uuid(),");
  });

  it("should handle nullable fields in generated schema", () => {
    const entity = defineEntity({
      name: "Order",
      fields: {
        id: uuid(),
        notes: string({ nullable: true }),
      },
    });

    const file = generateEntitySchema(entity);

    expect(file.content).toContain("id: z.string().uuid(),");
    expect(file.content).toContain("notes: z.string().nullable(),");
  });

  it("should use PascalCase for schema name and snake_case for filename", () => {
    const entity = defineEntity({
      name: "OrderItem",
      fields: { id: uuid() },
    });

    const file = generateEntitySchema(entity);

    expect(file.path).toBe("schemas/order_item.schema.ts");
    expect(file.content).toContain("OrderItemSchema");
    expect(file.content).toContain("parseOrderItem");
    expect(file.content).toContain("safeParseOrderItem");
  });
});

describe("generateSchemas", () => {
  it("should generate schema files for all entities plus barrel index", () => {
    const user = defineEntity({
      name: "User",
      fields: { id: uuid(), name: string() },
    });
    const order = defineEntity({
      name: "Order",
      fields: {
        id: uuid(),
        userId: ref("User"),
        status: enumField(["pending", "shipped"]),
      },
    });
    const schema = createRegistry([user, order]);
    const files = generateSchemas(schema);

    // 2 entity files + 1 barrel index
    expect(files).toHaveLength(3);

    const paths = files.map((f) => f.path);
    expect(paths).toContain("schemas/user.schema.ts");
    expect(paths).toContain("schemas/order.schema.ts");
    expect(paths).toContain("schemas/index.ts");
  });

  it("should generate barrel index with re-exports for each entity", () => {
    const user = defineEntity({
      name: "User",
      fields: { id: uuid() },
    });
    const order = defineEntity({
      name: "Order",
      fields: { id: uuid() },
    });
    const schema = createRegistry([user, order]);
    const files = generateSchemas(schema);

    const index = files.find((f) => f.path === "schemas/index.ts");
    expect(index).toBeDefined();
    expect(index!.content).toContain('export * from "./user.schema.js"');
    expect(index!.content).toContain('export * from "./order.schema.js"');
  });

  it("should return empty array for empty registry", () => {
    const schema = createRegistry([]);
    const files = generateSchemas(schema);
    expect(files).toHaveLength(0);
  });

  it("should include file header in all generated files", () => {
    const entity = defineEntity({
      name: "Item",
      fields: { id: uuid() },
    });
    const schema = createRegistry([entity]);
    const files = generateSchemas(schema);

    for (const file of files) {
      expect(file.content).toContain("AUTO-GENERATED by @dikta/generator");
      expect(file.content).toContain("DO NOT EDIT");
    }
  });
});
