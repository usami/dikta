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
  fieldToAttribute,
  entityToBlock,
  cascadeToRelationship,
  generateERDiagram,
  generateERDiagramFile,
} from "../src/diagram.js";

// ── fieldToAttribute ───────────────────────────────────────

describe("fieldToAttribute", () => {
  it("should map uuid field to uuid type with PK (uuid defaults to identifier role)", () => {
    expect(fieldToAttribute("id", uuid())).toBe("    uuid id PK");
  });

  it("should map string field to string type", () => {
    expect(fieldToAttribute("name", string())).toBe("    string name");
  });

  it("should map integer field to integer type", () => {
    expect(fieldToAttribute("quantity", integer())).toBe("    integer quantity");
  });

  it("should map decimal field to decimal type", () => {
    expect(fieldToAttribute("price", decimal())).toBe("    decimal price");
  });

  it("should map boolean field to boolean type", () => {
    expect(fieldToAttribute("active", boolean())).toBe("    boolean active");
  });

  it("should map timestamp field to timestamp type", () => {
    expect(fieldToAttribute("createdAt", timestamp())).toBe("    timestamp created_at");
  });

  it("should map enum field to enum type", () => {
    expect(fieldToAttribute("status", enumField(["active", "inactive"]))).toBe("    enum status");
  });

  it("should map ref field to uuid type with FK constraint", () => {
    expect(fieldToAttribute("userId", ref("User"))).toBe("    uuid user_id FK");
  });

  it("should add PK constraint for identifier role", () => {
    expect(fieldToAttribute("id", uuid({ role: "identifier" }))).toBe("    uuid id PK");
  });

  it("should add both PK and FK constraints when applicable", () => {
    expect(fieldToAttribute("userId", ref("User", { role: "identifier" }))).toBe("    uuid user_id PK,FK");
  });

  it("should include description as comment", () => {
    expect(fieldToAttribute("email", string({ description: "User email address" }))).toBe(
      '    string email "User email address"',
    );
  });

  it("should convert camelCase field names to snake_case", () => {
    expect(fieldToAttribute("createdAt", timestamp())).toBe("    timestamp created_at");
  });
});

// ── entityToBlock ──────────────────────────────────────────

describe("entityToBlock", () => {
  it("should generate a valid Mermaid entity block", () => {
    const entity = defineEntity({
      name: "User",
      fields: {
        id: uuid({ role: "identifier" }),
        name: string({ role: "display_name" }),
        email: string(),
      },
    });

    const block = entityToBlock(entity);

    expect(block).toBe(
      [
        "  User {",
        "    uuid id PK",
        "    string name",
        "    string email",
        "  }",
      ].join("\n"),
    );
  });

  it("should handle entity with ref fields", () => {
    const entity = defineEntity({
      name: "Order",
      fields: {
        id: uuid({ role: "identifier" }),
        userId: ref("User"),
        total: decimal({ role: "monetary" }),
      },
    });

    const block = entityToBlock(entity);

    expect(block).toContain("uuid user_id FK");
    expect(block).toContain("decimal total");
  });
});

// ── cascadeToRelationship ──────────────────────────────────

describe("cascadeToRelationship", () => {
  it("should return exactly-one to zero-or-more for non-nullable FK", () => {
    expect(cascadeToRelationship("restrict", false)).toBe("||--o{");
  });

  it("should return zero-or-one to zero-or-more for nullable FK", () => {
    expect(cascadeToRelationship("restrict", true)).toBe("|o--o{");
  });

  it("should use same notation regardless of cascade rule", () => {
    expect(cascadeToRelationship("cascade", false)).toBe("||--o{");
    expect(cascadeToRelationship("set_null", true)).toBe("|o--o{");
    expect(cascadeToRelationship("soft_delete", false)).toBe("||--o{");
  });
});

// ── generateERDiagram ──────────────────────────────────────

describe("generateERDiagram", () => {
  it("should return empty string for empty registry", () => {
    const registry = createRegistry([]);
    expect(generateERDiagram(registry)).toBe("");
  });

  it("should generate a single entity without relationships", () => {
    const user = defineEntity({
      name: "User",
      fields: {
        id: uuid({ role: "identifier" }),
        name: string(),
      },
    });
    const registry = createRegistry([user]);
    const diagram = generateERDiagram(registry);

    expect(diagram).toContain("erDiagram");
    expect(diagram).toContain("User {");
    expect(diagram).toContain("uuid id PK");
    expect(diagram).toContain("string name");
  });

  it("should generate relationships between entities", () => {
    const user = defineEntity({
      name: "User",
      fields: {
        id: uuid({ role: "identifier" }),
        name: string(),
      },
    });
    const order = defineEntity({
      name: "Order",
      fields: {
        id: uuid({ role: "identifier" }),
        userId: ref("User"),
        total: decimal(),
      },
    });
    const registry = createRegistry([user, order]);
    const diagram = generateERDiagram(registry);

    expect(diagram).toContain("erDiagram");
    expect(diagram).toContain("User {");
    expect(diagram).toContain("Order {");
    // Non-nullable FK: User ||--o{ Order : "user_id"
    expect(diagram).toContain('User ||--o{ Order : "user_id"');
  });

  it("should handle nullable ref as optional relationship", () => {
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
    const diagram = generateERDiagram(registry);

    // Nullable FK: User |o--o{ Order : "assignee_id"
    expect(diagram).toContain('User |o--o{ Order : "assignee_id"');
  });

  it("should handle multiple relationships", () => {
    const user = defineEntity({
      name: "User",
      fields: { id: uuid({ role: "identifier" }) },
    });
    const product = defineEntity({
      name: "Product",
      fields: { id: uuid({ role: "identifier" }) },
    });
    const order = defineEntity({
      name: "Order",
      fields: {
        id: uuid({ role: "identifier" }),
        userId: ref("User"),
        productId: ref("Product"),
      },
    });
    const registry = createRegistry([user, product, order]);
    const diagram = generateERDiagram(registry);

    expect(diagram).toContain('User ||--o{ Order : "user_id"');
    expect(diagram).toContain('Product ||--o{ Order : "product_id"');
  });

  it("should end with a trailing newline", () => {
    const entity = defineEntity({
      name: "User",
      fields: { id: uuid() },
    });
    const registry = createRegistry([entity]);
    const diagram = generateERDiagram(registry);

    expect(diagram).toMatch(/\n$/);
  });
});

// ── generateERDiagramFile ──────────────────────────────────

describe("generateERDiagramFile", () => {
  it("should return empty array for empty registry", () => {
    const registry = createRegistry([]);
    expect(generateERDiagramFile(registry)).toHaveLength(0);
  });

  it("should return a single .mmd file", () => {
    const entity = defineEntity({
      name: "User",
      fields: { id: uuid() },
    });
    const registry = createRegistry([entity]);
    const files = generateERDiagramFile(registry);

    expect(files).toHaveLength(1);
    expect(files[0]!.path).toBe("diagram/er.mmd");
    expect(files[0]!.purpose).toContain("ER diagram");
    expect(files[0]!.regeneratable).toBe(true);
  });

  it("should produce valid Mermaid content", () => {
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
        status: enumField(["pending", "shipped", "delivered"]),
      },
    });
    const registry = createRegistry([user, order]);
    const files = generateERDiagramFile(registry);

    const content = files[0]!.content;
    expect(content).toMatch(/^erDiagram\n/);
    expect(content).toContain("User {");
    expect(content).toContain("Order {");
    expect(content).toContain("uuid user_id FK");
    expect(content).toContain("enum status");
  });
});
