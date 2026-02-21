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
  fieldRoleToFaker,
  fieldKindToFaker,
  fieldToFakerExpression,
  entityToSeedBlock,
  generateSeedData,
  generateSeedDataFile,
} from "../src/seed.js";

// ── fieldRoleToFaker ──────────────────────────────────────

describe("fieldRoleToFaker", () => {
  it("should map identifier+uuid to faker.string.uuid()", () => {
    expect(fieldRoleToFaker("identifier", "uuid")).toBe("faker.string.uuid()");
  });

  it("should return null for identifier with non-uuid kind", () => {
    expect(fieldRoleToFaker("identifier", "string")).toBeNull();
  });

  it("should map monetary to Number(faker.finance.amount())", () => {
    expect(fieldRoleToFaker("monetary", "decimal")).toBe("Number(faker.finance.amount())");
  });

  it("should map audit_timestamp to faker.date.recent().toISOString()", () => {
    expect(fieldRoleToFaker("audit_timestamp", "timestamp")).toBe("faker.date.recent().toISOString()");
  });

  it("should map display_name to faker.person.fullName()", () => {
    expect(fieldRoleToFaker("display_name", "string")).toBe("faker.person.fullName()");
  });

  it("should map description to faker.lorem.sentence()", () => {
    expect(fieldRoleToFaker("description", "string")).toBe("faker.lorem.sentence()");
  });

  it("should return null for status (handled by enum logic)", () => {
    expect(fieldRoleToFaker("status", "enum")).toBeNull();
  });

  it("should map quantity to faker.number.int({ min: 1, max: 100 })", () => {
    expect(fieldRoleToFaker("quantity", "integer")).toBe("faker.number.int({ min: 1, max: 100 })");
  });

  it("should return null for reference (handled by ref logic)", () => {
    expect(fieldRoleToFaker("reference", "ref")).toBeNull();
  });

  it("should return null for general (fall through to kind)", () => {
    expect(fieldRoleToFaker("general", "string")).toBeNull();
  });
});

// ── fieldKindToFaker ──────────────────────────────────────

describe("fieldKindToFaker", () => {
  it("should map uuid to faker.string.uuid()", () => {
    expect(fieldKindToFaker("uuid")).toBe("faker.string.uuid()");
  });

  it("should map string to faker.lorem.word()", () => {
    expect(fieldKindToFaker("string")).toBe("faker.lorem.word()");
  });

  it("should map decimal to Number(faker.finance.amount())", () => {
    expect(fieldKindToFaker("decimal")).toBe("Number(faker.finance.amount())");
  });

  it("should map integer to faker.number.int()", () => {
    expect(fieldKindToFaker("integer")).toBe("faker.number.int({ min: 0, max: 1000 })");
  });

  it("should map boolean to faker.datatype.boolean()", () => {
    expect(fieldKindToFaker("boolean")).toBe("faker.datatype.boolean()");
  });

  it("should map timestamp to faker.date.recent().toISOString()", () => {
    expect(fieldKindToFaker("timestamp")).toBe("faker.date.recent().toISOString()");
  });
});

// ── fieldToFakerExpression ────────────────────────────────

describe("fieldToFakerExpression", () => {
  const emptyMap = new Map<string, { varName: string; identifierField: string }>();

  it("should handle ref field with FK lookup", () => {
    const field = ref("User");
    const varMap = new Map([["User", { varName: "users", identifierField: "id" }]]);
    expect(fieldToFakerExpression("userId", field, varMap)).toBe(
      "faker.helpers.arrayElement(users).id",
    );
  });

  it("should handle nullable ref field with maybe wrapper", () => {
    const field = ref("User", { nullable: true });
    const varMap = new Map([["User", { varName: "users", identifierField: "id" }]]);
    expect(fieldToFakerExpression("assigneeId", field, varMap)).toBe(
      "faker.helpers.maybe(() => faker.helpers.arrayElement(users).id, { probability: 0.8 })",
    );
  });

  it("should handle ref to entity with non-standard identifier field", () => {
    const field = ref("Product");
    const varMap = new Map([["Product", { varName: "products", identifierField: "sku" }]]);
    expect(fieldToFakerExpression("productId", field, varMap)).toBe(
      "faker.helpers.arrayElement(products).sku",
    );
  });

  it("should fall back to uuid for ref when parent not in map", () => {
    const field = ref("Unknown");
    expect(fieldToFakerExpression("unknownId", field, emptyMap)).toBe(
      "faker.string.uuid()",
    );
  });

  it("should handle enum field with literal values", () => {
    const field = enumField(["pending", "shipped", "delivered"]);
    expect(fieldToFakerExpression("status", field, emptyMap)).toBe(
      'faker.helpers.arrayElement(["pending", "shipped", "delivered"] as const)',
    );
  });

  it("should use role-specific mapping for display_name", () => {
    const field = string({ role: "display_name" });
    expect(fieldToFakerExpression("name", field, emptyMap)).toBe(
      "faker.person.fullName()",
    );
  });

  it("should use role-specific mapping for monetary", () => {
    const field = decimal({ role: "monetary" });
    expect(fieldToFakerExpression("total", field, emptyMap)).toBe(
      "Number(faker.finance.amount())",
    );
  });

  it("should use role-specific mapping for identifier uuid", () => {
    const field = uuid({ role: "identifier" });
    expect(fieldToFakerExpression("id", field, emptyMap)).toBe(
      "faker.string.uuid()",
    );
  });

  it("should fall through to kind mapping for general role", () => {
    const field = string();
    expect(fieldToFakerExpression("code", field, emptyMap)).toBe(
      "faker.lorem.word()",
    );
  });

  it("should fall through to kind mapping for boolean field", () => {
    const field = boolean();
    expect(fieldToFakerExpression("active", field, emptyMap)).toBe(
      "faker.datatype.boolean()",
    );
  });
});

// ── entityToSeedBlock ─────────────────────────────────────

describe("entityToSeedBlock", () => {
  it("should generate Array.from block with correct var name and count", () => {
    const entity = defineEntity({
      name: "User",
      fields: {
        id: uuid({ role: "identifier" }),
        name: string({ role: "display_name" }),
      },
    });
    const varMap = new Map([["User", { varName: "users", identifierField: "id" }]]);

    const block = entityToSeedBlock(entity, "users", 5, varMap);

    expect(block).toContain("export const users = Array.from({ length: 5 }, () => ({");
    expect(block).toContain("  id: faker.string.uuid(),");
    expect(block).toContain("  name: faker.person.fullName(),");
    expect(block).toContain("}));");
  });

  it("should include ref field with FK lookup", () => {
    const entity = defineEntity({
      name: "Order",
      fields: {
        id: uuid({ role: "identifier" }),
        userId: ref("User"),
        total: decimal({ role: "monetary" }),
      },
    });
    const varMap = new Map([
      ["User", { varName: "users", identifierField: "id" }],
      ["Order", { varName: "orders", identifierField: "id" }],
    ]);

    const block = entityToSeedBlock(entity, "orders", 10, varMap);

    expect(block).toContain("  userId: faker.helpers.arrayElement(users).id,");
    expect(block).toContain("  total: Number(faker.finance.amount()),");
  });

  it("should include enum field with literal values", () => {
    const entity = defineEntity({
      name: "Order",
      fields: {
        id: uuid({ role: "identifier" }),
        status: enumField(["pending", "shipped"]),
      },
    });
    const varMap = new Map([["Order", { varName: "orders", identifierField: "id" }]]);

    const block = entityToSeedBlock(entity, "orders", 10, varMap);

    expect(block).toContain('  status: faker.helpers.arrayElement(["pending", "shipped"] as const),');
  });
});

// ── generateSeedData ──────────────────────────────────────

describe("generateSeedData", () => {
  it("should return empty string for empty registry", () => {
    const registry = createRegistry([]);
    expect(generateSeedData(registry)).toBe("");
  });

  it("should generate correct file structure for single entity", () => {
    const user = defineEntity({
      name: "User",
      fields: {
        id: uuid({ role: "identifier" }),
        name: string({ role: "display_name" }),
        email: string(),
      },
    });
    const registry = createRegistry([user]);
    const output = generateSeedData(registry);

    expect(output).toContain("AUTO-GENERATED by @dikta/generator");
    expect(output).toContain('import { faker } from "@faker-js/faker";');
    expect(output).toContain("faker.seed(42);");
    expect(output).toContain("export const users = Array.from({ length: 10 }, () => ({");
    expect(output).toContain("  id: faker.string.uuid(),");
    expect(output).toContain("  name: faker.person.fullName(),");
    expect(output).toContain("  email: faker.lorem.word(),");
  });

  it("should respect custom seed config", () => {
    const user = defineEntity({
      name: "User",
      fields: { id: uuid({ role: "identifier" }) },
    });
    const registry = createRegistry([user]);
    const output = generateSeedData(registry, {
      defaultCount: 25,
      seed: 123,
    });

    expect(output).toContain("faker.seed(123);");
    expect(output).toContain("Array.from({ length: 25 }");
  });

  it("should respect per-entity count overrides", () => {
    const user = defineEntity({
      name: "User",
      fields: { id: uuid({ role: "identifier" }) },
    });
    const order = defineEntity({
      name: "Order",
      fields: {
        id: uuid({ role: "identifier" }),
        userId: ref("User"),
      },
    });
    const registry = createRegistry([user, order]);
    const output = generateSeedData(registry, {
      defaultCount: 5,
      counts: { Order: 20 },
    });

    expect(output).toContain("const users = Array.from({ length: 5 }");
    expect(output).toContain("const orders = Array.from({ length: 20 }");
  });

  it("should topologically order entities so parents come first", () => {
    const user = defineEntity({
      name: "User",
      fields: { id: uuid({ role: "identifier" }) },
    });
    const order = defineEntity({
      name: "Order",
      fields: {
        id: uuid({ role: "identifier" }),
        userId: ref("User"),
      },
    });
    const registry = createRegistry([order, user]); // reversed order
    const output = generateSeedData(registry);

    const usersPos = output.indexOf("export const users");
    const ordersPos = output.indexOf("export const orders");

    expect(usersPos).toBeLessThan(ordersPos);
  });

  it("should generate FK references correctly", () => {
    const user = defineEntity({
      name: "User",
      fields: {
        id: uuid({ role: "identifier" }),
        name: string({ role: "display_name" }),
      },
    });
    const order = defineEntity({
      name: "Order",
      fields: {
        id: uuid({ role: "identifier" }),
        userId: ref("User"),
        total: decimal({ role: "monetary" }),
        status: enumField(["pending", "shipped"]),
      },
    });
    const registry = createRegistry([user, order]);
    const output = generateSeedData(registry);

    expect(output).toContain("  userId: faker.helpers.arrayElement(users).id,");
    expect(output).toContain("  total: Number(faker.finance.amount()),");
    expect(output).toContain('  status: faker.helpers.arrayElement(["pending", "shipped"] as const),');
  });

  it("should handle nullable ref fields with maybe wrapper", () => {
    const user = defineEntity({
      name: "User",
      fields: { id: uuid({ role: "identifier" }) },
    });
    const order = defineEntity({
      name: "Order",
      fields: {
        id: uuid({ role: "identifier" }),
        assigneeId: ref("User", { nullable: true }),
      },
    });
    const registry = createRegistry([user, order]);
    const output = generateSeedData(registry);

    expect(output).toContain(
      "faker.helpers.maybe(() => faker.helpers.arrayElement(users).id, { probability: 0.8 })",
    );
  });

  it("should end with a trailing newline", () => {
    const entity = defineEntity({
      name: "User",
      fields: { id: uuid() },
    });
    const registry = createRegistry([entity]);
    const output = generateSeedData(registry);

    expect(output).toMatch(/\n$/);
  });

  it("should handle three-level FK chain", () => {
    const org = defineEntity({
      name: "Organization",
      fields: { id: uuid({ role: "identifier" }) },
    });
    const user = defineEntity({
      name: "User",
      fields: {
        id: uuid({ role: "identifier" }),
        orgId: ref("Organization"),
      },
    });
    const order = defineEntity({
      name: "Order",
      fields: {
        id: uuid({ role: "identifier" }),
        userId: ref("User"),
      },
    });
    const registry = createRegistry([order, user, org]);
    const output = generateSeedData(registry);

    const orgPos = output.indexOf("export const organizations");
    const userPos = output.indexOf("export const users");
    const orderPos = output.indexOf("export const orders");

    expect(orgPos).toBeLessThan(userPos);
    expect(userPos).toBeLessThan(orderPos);
    expect(output).toContain("faker.helpers.arrayElement(organizations).id");
    expect(output).toContain("faker.helpers.arrayElement(users).id");
  });
});

// ── generateSeedDataFile ──────────────────────────────────

describe("generateSeedDataFile", () => {
  it("should return empty array for empty registry", () => {
    const registry = createRegistry([]);
    expect(generateSeedDataFile(registry)).toHaveLength(0);
  });

  it("should return a single seeds/seed-data.ts file", () => {
    const entity = defineEntity({
      name: "User",
      fields: { id: uuid() },
    });
    const registry = createRegistry([entity]);
    const files = generateSeedDataFile(registry);

    expect(files).toHaveLength(1);
    expect(files[0]!.path).toBe("seeds/seed-data.ts");
    expect(files[0]!.purpose).toContain("seed data");
    expect(files[0]!.regeneratable).toBe(true);
  });

  it("should pass config to generateSeedData", () => {
    const entity = defineEntity({
      name: "User",
      fields: { id: uuid() },
    });
    const registry = createRegistry([entity]);
    const files = generateSeedDataFile(registry, { defaultCount: 3, seed: 99 });

    expect(files[0]!.content).toContain("faker.seed(99);");
    expect(files[0]!.content).toContain("Array.from({ length: 3 }");
  });
});
