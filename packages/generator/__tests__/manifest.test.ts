import { describe, it, expect } from "vitest";
import {
  defineEntity,
  uuid,
  string,
  ref,
  createRegistry,
  defineQuery,
  createQueryRegistry,
} from "@dikta/core";
import { generateManifest, sha256 } from "../src/manifest.js";
import type { GeneratedFile } from "../src/types.js";

function makeSchemaAndQueries() {
  const Customer = defineEntity({
    name: "Customer",
    fields: {
      id: uuid(),
      name: string({ role: "display_name" }),
    },
  });

  const Order = defineEntity({
    name: "Order",
    fields: {
      id: uuid(),
      customerId: ref("Customer"),
    },
  });

  const schema = createRegistry([Customer, Order]);

  const query = defineQuery("getOrders", {
    purpose: "Fetch orders",
    from: "Order",
    returns: { shape: { id: "uuid" } },
  });
  const queries = createQueryRegistry([query], schema);

  return { schema, queries };
}

describe("sha256", () => {
  it("should produce deterministic hash", () => {
    expect(sha256("hello")).toBe(sha256("hello"));
  });

  it("should produce different hashes for different inputs", () => {
    expect(sha256("hello")).not.toBe(sha256("world"));
  });

  it("should return 64 character hex string", () => {
    expect(sha256("test")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("generateManifest", () => {
  it("should generate manifest with version 1", () => {
    const { schema, queries } = makeSchemaAndQueries();
    const files: GeneratedFile[] = [
      { path: "test.sql", content: "SELECT 1;", purpose: "test", regeneratable: true },
    ];

    const manifest = generateManifest(schema, queries, files);
    const parsed = JSON.parse(manifest.content);

    expect(parsed.version).toBe(1);
  });

  it("should include schema_hash and query_hash", () => {
    const { schema, queries } = makeSchemaAndQueries();
    const manifest = generateManifest(schema, queries, []);
    const parsed = JSON.parse(manifest.content);

    expect(parsed.schema_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(parsed.query_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("should include file entries with content hashes", () => {
    const { schema, queries } = makeSchemaAndQueries();
    const files: GeneratedFile[] = [
      { path: "a.sql", content: "SELECT 1;", purpose: "test A", regeneratable: true },
      { path: "b.ts", content: "export {};", purpose: "test B", regeneratable: false },
    ];

    const manifest = generateManifest(schema, queries, files);
    const parsed = JSON.parse(manifest.content);

    expect(parsed.files).toHaveLength(2);
    expect(parsed.files[0].path).toBe("a.sql");
    expect(parsed.files[0].content_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(parsed.files[1].regeneratable).toBe(false);
  });

  it("should produce deterministic schema hash", () => {
    const { schema, queries } = makeSchemaAndQueries();
    const m1 = JSON.parse(generateManifest(schema, queries, []).content);
    const m2 = JSON.parse(generateManifest(schema, queries, []).content);

    expect(m1.schema_hash).toBe(m2.schema_hash);
    expect(m1.query_hash).toBe(m2.query_hash);
  });

  it("should output to manifest.json", () => {
    const { schema, queries } = makeSchemaAndQueries();
    const manifest = generateManifest(schema, queries, []);
    expect(manifest.path).toBe("manifest.json");
  });
});
