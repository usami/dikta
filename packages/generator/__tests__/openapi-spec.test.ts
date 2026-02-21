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
  generateOpenAPISpec,
  assembleOpenAPISpec,
  toYAML,
} from "../src/openapi/index.js";
import type { OpenAPIConfig } from "../src/openapi/index.js";

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
    status: enumField(["pending", "shipped", "delivered"]),
    userId: ref("User"),
  },
});

// ── assembleOpenAPISpec ──────────────────────────────────

describe("assembleOpenAPISpec", () => {
  it("should produce a valid OpenAPI 3.1 root document", () => {
    const { schema, queries } = makeRegistries(
      [user, order],
      [["getUsers", {
        purpose: "List users",
        from: "User",
        returns: { shape: { id: "uuid", name: "string" } },
      }]],
    );

    const spec = assembleOpenAPISpec(schema, queries);

    expect(spec.openapi).toBe("3.1.0");
    expect(spec.info).toEqual({ title: "API", version: "1.0.0" });
    expect(spec).toHaveProperty("paths");
    expect(spec).toHaveProperty("components");
  });

  it("should use config values for info object", () => {
    const { schema, queries } = makeRegistries([user], []);

    const config: OpenAPIConfig = {
      title: "Dikta API",
      description: "Generated API specification",
      version: "2.5.0",
      contact: { name: "API Team", email: "api@example.com", url: "https://example.com" },
      license: { name: "MIT", url: "https://opensource.org/licenses/MIT" },
    };

    const spec = assembleOpenAPISpec(schema, queries, config);
    const info = spec.info as Record<string, unknown>;

    expect(info.title).toBe("Dikta API");
    expect(info.description).toBe("Generated API specification");
    expect(info.version).toBe("2.5.0");
    expect(info.contact).toEqual({
      name: "API Team",
      email: "api@example.com",
      url: "https://example.com",
    });
    expect(info.license).toEqual({
      name: "MIT",
      url: "https://opensource.org/licenses/MIT",
    });
  });

  it("should include servers when configured", () => {
    const { schema, queries } = makeRegistries([user], []);

    const config: OpenAPIConfig = {
      servers: [
        { url: "https://api.example.com", description: "Production" },
        { url: "https://staging.example.com" },
      ],
    };

    const spec = assembleOpenAPISpec(schema, queries, config);
    const servers = spec.servers as Record<string, unknown>[];

    expect(servers).toHaveLength(2);
    expect(servers[0]).toEqual({ url: "https://api.example.com", description: "Production" });
    expect(servers[1]).toEqual({ url: "https://staging.example.com" });
  });

  it("should omit servers when not configured", () => {
    const { schema, queries } = makeRegistries([user], []);
    const spec = assembleOpenAPISpec(schema, queries);
    expect(spec).not.toHaveProperty("servers");
  });

  it("should omit description from info when not provided", () => {
    const { schema, queries } = makeRegistries([user], []);
    const spec = assembleOpenAPISpec(schema, queries);
    const info = spec.info as Record<string, unknown>;
    expect(info).not.toHaveProperty("description");
  });
});

// ── Component Schemas ────────────────────────────────────

describe("component schemas", () => {
  it("should include entity schemas in components", () => {
    const { schema, queries } = makeRegistries([user, order], []);
    const spec = assembleOpenAPISpec(schema, queries);
    const components = spec.components as Record<string, unknown>;
    const schemas = components.schemas as Record<string, unknown>;

    expect(schemas).toHaveProperty("User");
    expect(schemas).toHaveProperty("Order");

    const userSchema = schemas.User as Record<string, unknown>;
    expect(userSchema.type).toBe("object");
    expect(userSchema.required).toEqual(["id", "name", "email"]);
  });

  it("should always include ErrorResponse schema", () => {
    const { schema, queries } = makeRegistries([user], []);
    const spec = assembleOpenAPISpec(schema, queries);
    const components = spec.components as Record<string, unknown>;
    const schemas = components.schemas as Record<string, unknown>;

    expect(schemas).toHaveProperty("ErrorResponse");

    const errorSchema = schemas.ErrorResponse as Record<string, unknown>;
    expect(errorSchema.type).toBe("object");
    expect(errorSchema.required).toEqual(["error"]);

    const errorProp = (errorSchema.properties as Record<string, unknown>).error as Record<string, unknown>;
    expect(errorProp.type).toBe("object");
    expect(errorProp.required).toEqual(["code", "message"]);
  });

  it("should include ErrorResponse even with no entities", () => {
    const schema = createRegistry([]);
    const queryRegistry = createQueryRegistry([], schema);
    const spec = assembleOpenAPISpec(schema, queryRegistry);
    const components = spec.components as Record<string, unknown>;
    const schemas = components.schemas as Record<string, unknown>;

    expect(schemas).toHaveProperty("ErrorResponse");
  });
});

// ── Error Responses ──────────────────────────────────────

describe("error responses", () => {
  it("should include standard error responses in components when paths exist", () => {
    const { schema, queries } = makeRegistries(
      [user],
      [["getUsers", {
        purpose: "List users",
        from: "User",
        returns: { shape: { id: "uuid" } },
      }]],
    );

    const spec = assembleOpenAPISpec(schema, queries);
    const components = spec.components as Record<string, unknown>;
    const responses = components.responses as Record<string, unknown>;

    expect(responses).toHaveProperty("BadRequest");
    expect(responses).toHaveProperty("NotFound");
    expect(responses).toHaveProperty("InternalError");

    const badRequest = responses.BadRequest as Record<string, unknown>;
    expect(badRequest.description).toContain("Bad request");
    const content = badRequest.content as Record<string, unknown>;
    const json = content["application/json"] as Record<string, unknown>;
    expect(json.schema).toEqual({ $ref: "#/components/schemas/ErrorResponse" });
  });

  it("should omit error responses from components when no paths", () => {
    const { schema, queries } = makeRegistries([user], []);
    const spec = assembleOpenAPISpec(schema, queries);
    const components = spec.components as Record<string, unknown>;

    expect(components).not.toHaveProperty("responses");
  });

  it("should add error response refs to each path operation", () => {
    const { schema, queries } = makeRegistries(
      [user],
      [["getUserById", {
        purpose: "Get user by ID",
        from: "User",
        params: { id: { type: "uuid", required: true } },
        returns: { shape: { id: "uuid", name: "string" } },
      }]],
    );

    const spec = assembleOpenAPISpec(schema, queries);
    const paths = spec.paths as Record<string, unknown>;
    const pathItem = paths["/users/{id}"] as Record<string, unknown>;
    const operation = pathItem.get as Record<string, unknown>;
    const responses = operation.responses as Record<string, unknown>;

    expect(responses["200"]).toBeDefined();
    expect(responses["400"]).toEqual({ $ref: "#/components/responses/BadRequest" });
    expect(responses["404"]).toEqual({ $ref: "#/components/responses/NotFound" });
    expect(responses["500"]).toEqual({ $ref: "#/components/responses/InternalError" });
  });
});

// ── Paths ────────────────────────────────────────────────

describe("paths in assembled spec", () => {
  it("should include paths derived from query contracts", () => {
    const { schema, queries } = makeRegistries(
      [user, order],
      [
        ["getUsers", {
          purpose: "List users",
          from: "User",
          returns: { shape: { id: "uuid", name: "string" } },
        }],
        ["getOrders", {
          purpose: "List orders",
          from: "Order",
          returns: { shape: { id: "uuid", amount: "decimal" } },
        }],
      ],
    );

    const spec = assembleOpenAPISpec(schema, queries);
    const paths = spec.paths as Record<string, unknown>;

    expect(paths).toHaveProperty("/users");
    expect(paths).toHaveProperty("/orders");
  });

  it("should omit paths when no query contracts exist", () => {
    const { schema, queries } = makeRegistries([user], []);
    const spec = assembleOpenAPISpec(schema, queries);
    expect(spec).not.toHaveProperty("paths");
  });
});

// ── generateOpenAPISpec ──────────────────────────────────

describe("generateOpenAPISpec", () => {
  it("should generate a single JSON file by default", () => {
    const { schema, queries } = makeRegistries(
      [user],
      [["getUsers", {
        purpose: "List users",
        from: "User",
        returns: { shape: { id: "uuid" } },
      }]],
    );

    const files = generateOpenAPISpec(schema, queries);

    expect(files).toHaveLength(1);
    expect(files[0]!.path).toBe("openapi/spec.json");
    expect(files[0]!.purpose).toContain("OpenAPI 3.1");
    expect(files[0]!.regeneratable).toBe(true);

    const spec = JSON.parse(files[0]!.content);
    expect(spec.openapi).toBe("3.1.0");
  });

  it("should generate only YAML when format is yaml", () => {
    const { schema, queries } = makeRegistries([user], []);

    const files = generateOpenAPISpec(schema, queries, { format: "yaml" });

    expect(files).toHaveLength(1);
    expect(files[0]!.path).toBe("openapi/spec.yaml");
    expect(files[0]!.purpose).toContain("YAML");
  });

  it("should generate both JSON and YAML when format is both", () => {
    const { schema, queries } = makeRegistries([user], []);

    const files = generateOpenAPISpec(schema, queries, { format: "both" });

    expect(files).toHaveLength(2);
    expect(files.map((f) => f.path)).toEqual([
      "openapi/spec.json",
      "openapi/spec.yaml",
    ]);
  });

  it("should produce valid JSON output", () => {
    const { schema, queries } = makeRegistries(
      [user, order],
      [
        ["getUsers", {
          purpose: "List users",
          from: "User",
          returns: { shape: { id: "uuid", name: "string" } },
        }],
        ["getOrderById", {
          purpose: "Get order by ID",
          from: "Order",
          params: { id: { type: "uuid", required: true } },
          returns: { shape: { id: "uuid", amount: "decimal" } },
        }],
      ],
    );

    const files = generateOpenAPISpec(schema, queries);
    expect(() => JSON.parse(files[0]!.content)).not.toThrow();
  });

  it("should pass config through to spec assembly", () => {
    const { schema, queries } = makeRegistries([user], []);

    const config: OpenAPIConfig = {
      title: "My API",
      version: "3.0.0",
      servers: [{ url: "https://api.example.com" }],
    };

    const files = generateOpenAPISpec(schema, queries, config);
    const spec = JSON.parse(files[0]!.content);

    expect((spec.info as Record<string, unknown>).title).toBe("My API");
    expect((spec.info as Record<string, unknown>).version).toBe("3.0.0");
    expect(spec.servers).toHaveLength(1);
  });

  it("should handle empty registries", () => {
    const schema = createRegistry([]);
    const queryRegistry = createQueryRegistry([], schema);

    const files = generateOpenAPISpec(schema, queryRegistry);

    expect(files).toHaveLength(1);
    const spec = JSON.parse(files[0]!.content);
    expect(spec.openapi).toBe("3.1.0");
    expect(spec).not.toHaveProperty("paths");
    expect(spec).not.toHaveProperty("servers");
  });
});

// ── toYAML ───────────────────────────────────────────────

describe("toYAML", () => {
  it("should serialize simple key-value pairs", () => {
    const yaml = toYAML({ openapi: "3.1.0", version: "1.0.0" });
    expect(yaml).toContain("openapi: \"3.1.0\"");
    expect(yaml).toContain("version: \"1.0.0\"");
  });

  it("should serialize nested objects with indentation", () => {
    const yaml = toYAML({
      info: {
        title: "My API",
        version: "1.0.0",
      },
    });
    expect(yaml).toContain("info:");
    expect(yaml).toContain("  title: My API");
    expect(yaml).toContain("  version: \"1.0.0\"");
  });

  it("should use flow style for scalar arrays", () => {
    const yaml = toYAML({
      required: ["id", "name", "email"],
    });
    // Plain strings don't need quoting in YAML flow style
    expect(yaml).toContain("required: [id, name, email]");
  });

  it("should use block style for object arrays", () => {
    const yaml = toYAML({
      servers: [
        { url: "https://api.example.com", description: "Production" },
        { url: "https://staging.example.com" },
      ],
    });
    expect(yaml).toContain("servers:");
    // URLs contain ":" which triggers quoting
    expect(yaml).toContain('  - url: "https://api.example.com"');
    expect(yaml).toContain("    description: Production");
    expect(yaml).toContain('  - url: "https://staging.example.com"');
  });

  it("should quote strings with special characters", () => {
    const yaml = toYAML({
      $ref: "#/components/schemas/User",
    });
    expect(yaml).toContain('$ref: "#/components/schemas/User"');
  });

  it("should quote numeric keys", () => {
    const yaml = toYAML({
      responses: {
        "200": { description: "OK" },
        "404": { description: "Not Found" },
      },
    });
    expect(yaml).toContain('"200":');
    expect(yaml).toContain('"404":');
  });

  it("should handle null values", () => {
    const yaml = toYAML({ value: null });
    expect(yaml).toContain("value: null");
  });

  it("should handle boolean values", () => {
    const yaml = toYAML({ required: true, optional: false });
    expect(yaml).toContain("required: true");
    expect(yaml).toContain("optional: false");
  });

  it("should handle integer values", () => {
    const yaml = toYAML({ count: 42 });
    expect(yaml).toContain("count: 42");
  });

  it("should handle empty objects as {}", () => {
    const yaml = toYAML({ empty: {} });
    expect(yaml).toContain("empty: {}");
  });

  it("should handle empty arrays as []", () => {
    const yaml = toYAML({ items: [] });
    expect(yaml).toContain("items: []");
  });

  it("should quote string values that look like booleans", () => {
    const yaml = toYAML({ type: "true" });
    expect(yaml).toContain('type: "true"');
  });

  it("should quote string values that look like numbers", () => {
    const yaml = toYAML({ version: "1.0.0" });
    expect(yaml).toContain('version: "1.0.0"');
  });

  it("should handle nullable type arrays in flow style", () => {
    const yaml = toYAML({
      type: ["string", "null"],
    });
    // "null" is a YAML keyword so gets quoted; "string" is plain
    expect(yaml).toContain('type: [string, "null"]');
  });

  it("should produce valid YAML for a complete OpenAPI spec", () => {
    const { schema, queries } = makeRegistries(
      [user, order],
      [["getUsers", {
        purpose: "List users",
        from: "User",
        returns: { shape: { id: "uuid", name: "string" } },
      }]],
    );

    const spec = assembleOpenAPISpec(schema, queries, {
      title: "Test API",
      version: "1.0.0",
      servers: [{ url: "https://api.example.com", description: "Production" }],
    });

    const yaml = toYAML(spec);

    // Verify key structural elements are present
    expect(yaml).toContain("openapi: \"3.1.0\"");
    expect(yaml).toContain("title: Test API");
    expect(yaml).toContain("servers:");
    expect(yaml).toContain('  - url: "https://api.example.com"');
    expect(yaml).toContain("/users:");
    expect(yaml).toContain("operationId: getUsers");
    expect(yaml).toContain("ErrorResponse:");
    // End with newline
    expect(yaml.endsWith("\n")).toBe(true);
  });
});
