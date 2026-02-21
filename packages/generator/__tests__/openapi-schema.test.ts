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
import { generateOpenAPISchemas, entityToJsonSchema, fieldToJsonSchema } from "../src/openapi/index.js";

describe("fieldToJsonSchema", () => {
  it("should map uuid to string with uuid format", () => {
    expect(fieldToJsonSchema(uuid())).toEqual({ type: "string", format: "uuid" });
  });

  it("should map string to string type", () => {
    expect(fieldToJsonSchema(string())).toEqual({ type: "string" });
  });

  it("should map decimal to number type", () => {
    expect(fieldToJsonSchema(decimal())).toEqual({ type: "number" });
  });

  it("should map integer to integer type", () => {
    expect(fieldToJsonSchema(integer())).toEqual({ type: "integer" });
  });

  it("should map boolean to boolean type", () => {
    expect(fieldToJsonSchema(boolean())).toEqual({ type: "boolean" });
  });

  it("should map timestamp to string with date-time format", () => {
    expect(fieldToJsonSchema(timestamp())).toEqual({ type: "string", format: "date-time" });
  });

  it("should map enum to string with enum values", () => {
    expect(fieldToJsonSchema(enumField(["pending", "shipped", "delivered"]))).toEqual({
      type: "string",
      enum: ["pending", "shipped", "delivered"],
    });
  });

  it("should map ref to $ref component schema", () => {
    expect(fieldToJsonSchema(ref("User"))).toEqual({
      $ref: "#/components/schemas/User",
    });
  });

  it("should PascalCase ref entity names", () => {
    expect(fieldToJsonSchema(ref("orderItem"))).toEqual({
      $ref: "#/components/schemas/OrderItem",
    });
  });

  // ── Nullable handling ──────────────────────────────────

  it("should make simple types nullable via type array", () => {
    expect(fieldToJsonSchema(string({ nullable: true }))).toEqual({
      type: ["string", "null"],
    });
  });

  it("should preserve format when nullable", () => {
    expect(fieldToJsonSchema(uuid({ nullable: true }))).toEqual({
      type: ["string", "null"],
      format: "uuid",
    });
  });

  it("should make timestamp nullable with format preserved", () => {
    expect(fieldToJsonSchema(timestamp({ nullable: true }))).toEqual({
      type: ["string", "null"],
      format: "date-time",
    });
  });

  it("should make enum nullable via anyOf", () => {
    expect(fieldToJsonSchema(enumField(["a", "b"], { nullable: true }))).toEqual({
      anyOf: [{ type: "string", enum: ["a", "b"] }, { type: "null" }],
    });
  });

  it("should make ref nullable via anyOf", () => {
    expect(fieldToJsonSchema(ref("User", { nullable: true }))).toEqual({
      anyOf: [{ $ref: "#/components/schemas/User" }, { type: "null" }],
    });
  });

  // ── Description handling ───────────────────────────────

  it("should include description when present", () => {
    expect(fieldToJsonSchema(string({ description: "User email" }))).toEqual({
      type: "string",
      description: "User email",
    });
  });

  it("should omit description when empty", () => {
    expect(fieldToJsonSchema(string())).toEqual({ type: "string" });
  });

  it("should include description on nullable simple types", () => {
    expect(fieldToJsonSchema(string({ nullable: true, description: "Notes" }))).toEqual({
      type: ["string", "null"],
      description: "Notes",
    });
  });

  it("should include description on nullable ref via anyOf", () => {
    expect(fieldToJsonSchema(ref("User", { nullable: true, description: "Owner" }))).toEqual({
      anyOf: [{ $ref: "#/components/schemas/User" }, { type: "null" }],
      description: "Owner",
    });
  });

  it("should include description on nullable enum via anyOf", () => {
    expect(fieldToJsonSchema(enumField(["a", "b"], { nullable: true, description: "Status" }))).toEqual({
      anyOf: [{ type: "string", enum: ["a", "b"] }, { type: "null" }],
      description: "Status",
    });
  });

  it("should include description on $ref without nullable", () => {
    expect(fieldToJsonSchema(ref("User", { description: "Owner" }))).toEqual({
      $ref: "#/components/schemas/User",
      description: "Owner",
    });
  });
});

describe("entityToJsonSchema", () => {
  it("should generate object schema with all fields as required", () => {
    const entity = defineEntity({
      name: "User",
      fields: {
        id: uuid(),
        name: string({ role: "display_name" }),
        email: string(),
      },
    });

    const schema = entityToJsonSchema(entity);

    expect(schema.type).toBe("object");
    expect(schema.required).toEqual(["id", "name", "email"]);
    expect(schema.properties).toEqual({
      id: { type: "string", format: "uuid" },
      name: { type: "string" },
      email: { type: "string" },
    });
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

    const schema = entityToJsonSchema(entity);

    expect(schema.properties).toEqual({
      id: { type: "string", format: "uuid" },
      name: { type: "string" },
      price: { type: "number" },
      qty: { type: "integer" },
      active: { type: "boolean" },
      createdAt: { type: "string", format: "date-time" },
      status: { type: "string", enum: ["open", "closed"] },
      ownerId: { $ref: "#/components/schemas/User" },
    });
    expect(schema.required).toEqual([
      "id", "name", "price", "qty", "active", "createdAt", "status", "ownerId",
    ]);
  });

  it("should handle nullable fields in required list", () => {
    const entity = defineEntity({
      name: "Order",
      fields: {
        id: uuid(),
        notes: string({ nullable: true }),
      },
    });

    const schema = entityToJsonSchema(entity);

    // All fields are required (nullable means "can be null", not "can be absent")
    expect(schema.required).toEqual(["id", "notes"]);
    expect((schema.properties as Record<string, unknown>).notes).toEqual({
      type: ["string", "null"],
    });
  });
});

describe("generateOpenAPISchemas", () => {
  it("should generate a single schemas.json file for all entities", () => {
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
    const registry = createRegistry([user, order]);
    const files = generateOpenAPISchemas(registry);

    expect(files).toHaveLength(1);
    expect(files[0]!.path).toBe("openapi/schemas.json");
    expect(files[0]!.purpose).toContain("OpenAPI");
    expect(files[0]!.regeneratable).toBe(true);

    const schemas = JSON.parse(files[0]!.content);

    expect(schemas.User).toEqual({
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        name: { type: "string" },
      },
      required: ["id", "name"],
    });

    expect(schemas.Order).toEqual({
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        userId: { $ref: "#/components/schemas/User" },
        status: { type: "string", enum: ["pending", "shipped"] },
      },
      required: ["id", "userId", "status"],
    });
  });

  it("should return empty array for empty registry", () => {
    const registry = createRegistry([]);
    const files = generateOpenAPISchemas(registry);
    expect(files).toHaveLength(0);
  });

  it("should use PascalCase for schema keys", () => {
    const entity = defineEntity({
      name: "OrderItem",
      fields: { id: uuid() },
    });
    const registry = createRegistry([entity]);
    const files = generateOpenAPISchemas(registry);

    const schemas = JSON.parse(files[0]!.content);
    expect(schemas).toHaveProperty("OrderItem");
  });

  it("should produce valid JSON output", () => {
    const entity = defineEntity({
      name: "User",
      fields: {
        id: uuid(),
        name: string({ description: 'User "display" name' }),
      },
    });
    const registry = createRegistry([entity]);
    const files = generateOpenAPISchemas(registry);

    // Should not throw
    expect(() => JSON.parse(files[0]!.content)).not.toThrow();
  });
});
