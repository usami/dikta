import { describe, it, expect } from "vitest";
import {
  defineEntity,
  createRegistry,
  uuid,
  string,
  decimal,
  integer,
  timestamp,
  enumField,
  ref,
  defineQuery,
  createQueryRegistry,
} from "@dikta/core";
import { planMigration } from "../src/planner.js";
import {
  defineMigration,
  addField,
  removeField,
  renameField,
} from "../src/definition.js";
import { generateMigrationFiles, generateMigrationDirectory } from "../src/sql-generator.js";

describe("integration: shipping address migration", () => {
  // V1 schema: simple order system
  const CustomerV1 = defineEntity({
    name: "Customer",
    fields: {
      id: uuid({ role: "identifier" }),
      name: string({ role: "display_name" }),
      email: string({ pii: true }),
    },
  });

  const OrderV1 = defineEntity({
    name: "Order",
    fields: {
      id: uuid({ role: "identifier" }),
      customer_id: ref("Customer"),
      total: decimal({ role: "monetary" }),
      status: enumField(["pending", "shipped"]),
      created_at: timestamp({ role: "audit_timestamp" }),
    },
    invariants: ["total >= 0"],
  });

  // V2 schema: add shipping address + new status
  const Address = defineEntity({
    name: "Address",
    fields: {
      id: uuid({ role: "identifier" }),
      customer_id: ref("Customer"),
      line1: string(),
      line2: string({ nullable: true }),
      city: string(),
      postal_code: string(),
      country: string(),
    },
  });

  const OrderV2 = defineEntity({
    name: "Order",
    fields: {
      id: uuid({ role: "identifier" }),
      customer_id: ref("Customer"),
      shipping_address_id: ref("Address"),
      total: decimal({ role: "monetary" }),
      status: enumField(["pending", "shipped", "delivered"]),
      created_at: timestamp({ role: "audit_timestamp" }),
    },
    invariants: ["total >= 0"],
  });

  const beforeRegistry = createRegistry([CustomerV1, OrderV1]);
  const afterRegistry = createRegistry([CustomerV1, Address, OrderV2]);

  // Query contract
  const getOrdersByCustomer = defineQuery("getOrdersByCustomer", {
    purpose: "List orders for a customer",
    from: "Order",
    params: {
      customer_id: { type: "uuid", required: true },
    },
    returns: {
      shape: {
        id: "uuid",
        total: "decimal",
        status: "string",
        customer_name: { from: "Customer.name" },
      },
    },
  });

  const queries = createQueryRegistry([getOrdersByCustomer], afterRegistry);

  it("should detect all changes in the shipping address migration", () => {
    const plan = planMigration(beforeRegistry, afterRegistry, queries);

    // Should have:
    // 1. add_field: Order.shipping_address_id
    // 2. alter_field: Order.status (enum values added)
    // 3. add_entity: Address
    const changeKinds = plan.changes.map((c) => c.kind);
    expect(changeKinds).toContain("add_entity");
    expect(changeKinds).toContain("add_field");
    expect(changeKinds).toContain("alter_field");

    // Verify the entity add
    const addEntityChange = plan.changes.find((c) => c.kind === "add_entity");
    expect(addEntityChange).toBeDefined();
    if (addEntityChange?.kind === "add_entity") {
      expect(addEntityChange.entity).toBe("Address");
    }

    // Verify the field add
    const addFieldChange = plan.changes.find((c) => c.kind === "add_field");
    expect(addFieldChange).toBeDefined();
    if (addFieldChange?.kind === "add_field") {
      expect(addFieldChange.entity).toBe("Order");
      expect(addFieldChange.field).toBe("shipping_address_id");
      expect(addFieldChange.spec.kind).toBe("ref");
    }

    // Verify enum value addition
    const alterChange = plan.changes.find((c) => c.kind === "alter_field");
    expect(alterChange).toBeDefined();
    if (alterChange?.kind === "alter_field") {
      expect(alterChange.field).toBe("status");
      expect(alterChange.changes.values?.added).toEqual(["delivered"]);
    }
  });

  it("should evaluate safety correctly", () => {
    const plan = planMigration(beforeRegistry, afterRegistry, queries);

    // Adding a non-nullable ref field without backfill → caution
    expect(plan.safety.level).toBe("caution");
  });

  it("should detect query impact", () => {
    const plan = planMigration(beforeRegistry, afterRegistry, queries);

    // The query references Order which has changes
    // But none of the changes break the query's shape fields
    const orderImpact = plan.impact.contracts.find(
      (c) => c.query === "getOrdersByCustomer",
    );
    // The alter_field on status is compatible (added values, not removed)
    if (orderImpact) {
      expect(orderImpact.severity).not.toBe("breaking");
    }
  });

  it("should generate complete migration files", () => {
    const plan = planMigration(beforeRegistry, afterRegistry, queries);

    // Build a migration from the planned changes
    const migration = defineMigration("add_shipping_address", {
      changes: plan.changes,
      description: "Add Address entity and shipping_address_id to Order",
      timestamp: "2026-02-15T00:00:00.000Z",
    });

    const files = generateMigrationFiles(migration, plan.impact, plan.safety);

    // up.sql should contain both CREATE TABLE and ALTER TABLE
    expect(files.up).toContain("CREATE TABLE");
    expect(files.up).toContain("address");
    expect(files.up).toContain("shipping_address_id");
    expect(files.up).toContain("BEGIN;");
    expect(files.up).toContain("COMMIT;");

    // down.sql should reverse the operations
    expect(files.down).toContain("BEGIN;");
    expect(files.down).toContain("COMMIT;");

    // verify.sql should check all changes
    expect(files.verify).toContain("information_schema");

    // metadata should be complete
    expect(files.metadata.name).toBe("add_shipping_address");
    expect(files.metadata.changes.length).toBeGreaterThan(0);
    expect(files.metadata.safety.level).toBe("caution");
  });

  it("should generate migration directory with all four files", () => {
    const plan = planMigration(beforeRegistry, afterRegistry, queries);
    const migration = defineMigration("add_shipping_address", {
      changes: plan.changes,
      description: "Add Address entity and shipping_address_id to Order",
      timestamp: "2026-02-15T00:00:00.000Z",
    });

    const generatedFiles = generateMigrationDirectory(
      migration,
      plan.impact,
      plan.safety,
    );

    expect(generatedFiles).toHaveLength(4);
    const paths = generatedFiles.map((f) => f.path);

    expect(paths.some((p) => p.endsWith("/up.sql"))).toBe(true);
    expect(paths.some((p) => p.endsWith("/down.sql"))).toBe(true);
    expect(paths.some((p) => p.endsWith("/verify.sql"))).toBe(true);
    expect(paths.some((p) => p.endsWith("/metadata.json"))).toBe(true);

    // All paths should be under migrations/
    for (const path of paths) {
      expect(path.startsWith("migrations/")).toBe(true);
    }

    // Metadata JSON should be valid
    const metadataFile = generatedFiles.find((f) =>
      f.path.endsWith("/metadata.json"),
    )!;
    const metadata = JSON.parse(metadataFile.content);
    expect(metadata.name).toBe("add_shipping_address");
    expect(metadata.safety.level).toBe("caution");
  });
});
