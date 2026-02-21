import { describe, it, expect } from "vitest";
import {
  defineEntity,
  uuid,
  string,
  integer,
  decimal,
  timestamp,
  enumField,
  ref,
  createRegistry,
  defineQuery,
  createQueryRegistry,
} from "@dikta/core";
import { createPostgreSQLGenerator, createMySQLGenerator, createGenerator, generateAll } from "../src/generator.js";

function makeFullSchema() {
  const Customer = defineEntity({
    name: "Customer",
    fields: {
      id: uuid(),
      name: string({ role: "display_name" }),
      email: string({ pii: true }),
    },
  });

  const Order = defineEntity({
    name: "Order",
    fields: {
      id: uuid(),
      customerId: ref("Customer", { cascade: "cascade" }),
      status: enumField(["pending", "shipped", "delivered"]),
      totalAmount: decimal({ role: "monetary" }),
      createdAt: timestamp(),
    },
    invariants: ["totalAmount >= 0"],
  });

  return createRegistry([Customer, Order]);
}

function makeFullQueries(schema: ReturnType<typeof createRegistry>) {
  const query = defineQuery("getOrdersByCustomer", {
    purpose: "Fetch orders for a given customer",
    from: "Order",
    params: {
      customerId: { type: "uuid", required: true },
    },
    returns: {
      shape: {
        id: "uuid",
        status: "string",
        totalAmount: "decimal",
        createdAt: "timestamp",
      },
      ordering: [{ field: "createdAt", direction: "desc" }],
    },
    performance: { max_rows: 100 },
    security: { row_filter: "customerId" },
  });

  return createQueryRegistry([query], schema);
}

describe("createPostgreSQLGenerator", () => {
  it("should return a CodeGenerator with all four methods", () => {
    const gen = createPostgreSQLGenerator();
    expect(typeof gen.generateDDL).toBe("function");
    expect(typeof gen.generateAccessLayer).toBe("function");
    expect(typeof gen.generateValidators).toBe("function");
    expect(typeof gen.generateContractTests).toBe("function");
  });
});

describe("createMySQLGenerator", () => {
  it("should return a CodeGenerator with all four methods", () => {
    const gen = createMySQLGenerator();
    expect(typeof gen.generateDDL).toBe("function");
    expect(typeof gen.generateAccessLayer).toBe("function");
    expect(typeof gen.generateValidators).toBe("function");
    expect(typeof gen.generateContractTests).toBe("function");
  });
});

describe("createGenerator", () => {
  it("should return a valid CodeGenerator for postgresql", () => {
    const gen = createGenerator("postgresql");
    expect(typeof gen.generateDDL).toBe("function");
    expect(typeof gen.generateAccessLayer).toBe("function");
    expect(typeof gen.generateValidators).toBe("function");
    expect(typeof gen.generateContractTests).toBe("function");
  });

  it("should default to postgresql when no target is specified", () => {
    const gen = createGenerator();
    expect(typeof gen.generateDDL).toBe("function");
  });

  it("should return a valid CodeGenerator for mysql", () => {
    const gen = createGenerator("mysql");
    expect(typeof gen.generateDDL).toBe("function");
    expect(typeof gen.generateAccessLayer).toBe("function");
    expect(typeof gen.generateValidators).toBe("function");
    expect(typeof gen.generateContractTests).toBe("function");
  });
});

describe("generateAll", () => {
  it("should produce DDL + access + validators + tests + manifest", () => {
    const schema = makeFullSchema();
    const queries = makeFullQueries(schema);
    const files = generateAll(schema, queries);

    const paths = files.map((f) => f.path);

    // DDL files
    expect(paths.some((p) => p.startsWith("sql/"))).toBe(true);
    // Access layer
    expect(paths.some((p) => p.startsWith("access/"))).toBe(true);
    // Validators (Order has invariants)
    expect(paths.some((p) => p.startsWith("validators/"))).toBe(true);
    // Contract tests
    expect(paths.some((p) => p.startsWith("tests/"))).toBe(true);
    // Manifest
    expect(paths).toContain("manifest.json");
  });

  it("should throw on invalid query contracts", () => {
    const schema = createRegistry([
      defineEntity({
        name: "Customer",
        fields: { id: uuid(), name: string() },
      }),
    ]);

    const query = defineQuery("badQuery", {
      purpose: "Broken query",
      from: "NonExistent",
      returns: { shape: { id: "uuid" } },
    });

    const queries = createQueryRegistry([query], schema);

    expect(() => generateAll(schema, queries)).toThrow(
      /validation failed/,
    );
  });

  it("should generate valid SQL files", () => {
    const schema = makeFullSchema();
    const queries = makeFullQueries(schema);
    const files = generateAll(schema, queries);

    const sqlFiles = files.filter((f) => f.path.endsWith(".sql"));
    for (const file of sqlFiles) {
      // All SQL files should have CREATE TABLE or CREATE INDEX or be headers
      expect(file.content).toContain("AUTO-GENERATED");
    }
  });

  it("should include manifest with correct file count", () => {
    const schema = makeFullSchema();
    const queries = makeFullQueries(schema);
    const files = generateAll(schema, queries);

    const manifestFile = files.find((f) => f.path === "manifest.json")!;
    const manifest = JSON.parse(manifestFile.content);

    // Manifest should list all files except itself
    expect(manifest.files.length).toBe(files.length - 1);
  });
});

describe("generateAll with MySQL target", () => {
  it("should produce DDL + access + validators + tests + manifest for mysql", () => {
    const schema = makeFullSchema();
    const queries = makeFullQueries(schema);
    const files = generateAll(schema, queries, "mysql");

    const paths = files.map((f) => f.path);

    expect(paths.some((p) => p.startsWith("sql/"))).toBe(true);
    expect(paths.some((p) => p.startsWith("access/"))).toBe(true);
    expect(paths.some((p) => p.startsWith("validators/"))).toBe(true);
    expect(paths.some((p) => p.startsWith("tests/"))).toBe(true);
    expect(paths).toContain("manifest.json");
  });

  it("should generate MySQL-specific DDL syntax", () => {
    const schema = makeFullSchema();
    const queries = makeFullQueries(schema);
    const files = generateAll(schema, queries, "mysql");

    const customerSQL = files.find((f) => f.path.includes("customer") && f.path.endsWith(".sql"))!;
    expect(customerSQL.content).toContain("ENGINE=InnoDB");
    expect(customerSQL.content).toContain("CHAR(36)");
    expect(customerSQL.content).toContain("`customer`");
  });

  it("should generate MySQL-specific access layer syntax", () => {
    const schema = makeFullSchema();
    const queries = makeFullQueries(schema);
    const files = generateAll(schema, queries, "mysql");

    const accessFile = files.find((f) => f.path.includes("access/") && !f.path.includes("index.ts"))!;
    expect(accessFile.content).toContain("mysql2/promise");
    expect(accessFile.content).toContain("pool: Pool");
    expect(accessFile.content).toContain("pool.execute");
  });
});
