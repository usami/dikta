import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import {
  defineEntity,
  uuid,
  string,
  boolean,
  decimal,
  integer,
  timestamp,
  enumField,
  ref,
  createRegistry,
  defineQuery,
  createQueryRegistry,
} from "@dikta/core";
import { generateDDL } from "../src/targets/sqlite/ddl.js";
import { generateAccessLayer } from "../src/targets/sqlite/access.js";

// ── Test helpers ──────────────────────────────────────────────

/** Strip file header comments to get executable SQL */
function extractSQL(content: string): string {
  return content
    .split("\n")
    .filter((line) => !line.startsWith("//"))
    .join("\n")
    .trim();
}

/** Extract the raw SQL constant from a generated access layer file */
function extractSQLConstant(content: string): string {
  const match = content.match(/export const SQL_\w+ = `([\s\S]*?)`;/);
  if (!match?.[1]) throw new Error("SQL constant not found in generated file");
  return match[1];
}

// ── Schema fixtures ──────────────────────────────────────────

function makeSchema() {
  const Customer = defineEntity({
    name: "Customer",
    fields: {
      id: uuid(),
      name: string({ role: "display_name" }),
      email: string({ pii: true }),
      active: boolean(),
    },
  });

  const Order = defineEntity({
    name: "Order",
    fields: {
      id: uuid(),
      customerId: ref("Customer", { cascade: "cascade" }),
      status: enumField(["pending", "shipped", "delivered"]),
      totalAmount: decimal({ role: "monetary" }),
      quantity: integer({ role: "quantity" }),
      createdAt: timestamp(),
    },
  });

  return createRegistry([Customer, Order]);
}

// ── Integration tests ────────────────────────────────────────

describe("SQLite integration with better-sqlite3", () => {
  let db: InstanceType<typeof Database>;
  const schema = makeSchema();

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    // Execute generated DDL
    const ddlFiles = generateDDL(schema);
    for (const file of ddlFiles) {
      const sql = extractSQL(file.content);
      if (sql.length > 0) {
        // Execute each statement individually (some files have multiple statements)
        for (const stmt of sql.split(";").filter((s) => s.trim())) {
          db.exec(stmt + ";");
        }
      }
    }
  });

  describe("DDL execution", () => {
    it("should create tables from generated DDL", () => {
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
        )
        .all() as { name: string }[];

      const tableNames = tables.map((t) => t.name);
      expect(tableNames).toContain("customer");
      expect(tableNames).toContain("order");
    });

    it("should create correct column types for customer", () => {
      const columns = db.prepare("PRAGMA table_info('customer')").all() as {
        name: string;
        type: string;
        notnull: number;
        pk: number;
      }[];

      const colMap = new Map(columns.map((c) => [c.name, c]));

      expect(colMap.get("id")?.type).toBe("TEXT");
      expect(colMap.get("id")?.pk).toBe(1);
      expect(colMap.get("name")?.type).toBe("TEXT");
      expect(colMap.get("name")?.notnull).toBe(1);
      expect(colMap.get("email")?.type).toBe("TEXT");
      expect(colMap.get("active")?.type).toBe("INTEGER");
    });

    it("should create correct column types for order", () => {
      const columns = db.prepare("PRAGMA table_info('order')").all() as {
        name: string;
        type: string;
        notnull: number;
      }[];

      const colMap = new Map(columns.map((c) => [c.name, c]));

      expect(colMap.get("id")?.type).toBe("TEXT");
      expect(colMap.get("customer_id")?.type).toBe("TEXT");
      expect(colMap.get("status")?.type).toBe("TEXT");
      expect(colMap.get("total_amount")?.type).toBe("REAL");
      expect(colMap.get("quantity")?.type).toBe("INTEGER");
      expect(colMap.get("created_at")?.type).toBe("TEXT");
    });

    it("should enforce NOT NULL constraints", () => {
      expect(() =>
        db
          .prepare('INSERT INTO "customer" ("id", "name", "active") VALUES (?, ?, ?)')
          .run("c1", null, 1),
      ).toThrow();
    });

    it("should enforce CHECK constraints for enum fields", () => {
      db.prepare(
        'INSERT INTO "customer" ("id", "name", "email", "active") VALUES (?, ?, ?, ?)',
      ).run("c1", "Alice", "alice@test.com", 1);

      expect(() =>
        db
          .prepare(
            'INSERT INTO "order" ("id", "customer_id", "status", "total_amount", "quantity", "created_at") VALUES (?, ?, ?, ?, ?, ?)',
          )
          .run("o1", "c1", "invalid_status", 100.0, 1, "2025-01-01T00:00:00Z"),
      ).toThrow();
    });

    it("should enforce foreign key constraints", () => {
      expect(() =>
        db
          .prepare(
            'INSERT INTO "order" ("id", "customer_id", "status", "total_amount", "quantity", "created_at") VALUES (?, ?, ?, ?, ?, ?)',
          )
          .run(
            "o1",
            "nonexistent",
            "pending",
            100.0,
            1,
            "2025-01-01T00:00:00Z",
          ),
      ).toThrow();
    });

    it("should cascade delete from customer to order", () => {
      db.prepare(
        'INSERT INTO "customer" ("id", "name", "email", "active") VALUES (?, ?, ?, ?)',
      ).run("c1", "Alice", "alice@test.com", 1);
      db.prepare(
        'INSERT INTO "order" ("id", "customer_id", "status", "total_amount", "quantity", "created_at") VALUES (?, ?, ?, ?, ?, ?)',
      ).run("o1", "c1", "pending", 50.0, 2, "2025-01-01T00:00:00Z");

      db.prepare('DELETE FROM "customer" WHERE "id" = ?').run("c1");

      const orders = db
        .prepare('SELECT * FROM "order" WHERE "customer_id" = ?')
        .all("c1");
      expect(orders).toHaveLength(0);
    });
  });

  describe("access layer query execution", () => {
    beforeEach(() => {
      // Seed test data
      const insertCustomer = db.prepare(
        'INSERT INTO "customer" ("id", "name", "email", "active") VALUES (?, ?, ?, ?)',
      );
      insertCustomer.run("c1", "Alice", "alice@test.com", 1);
      insertCustomer.run("c2", "Bob", "bob@test.com", 1);
      insertCustomer.run("c3", "Charlie", "charlie@test.com", 0);

      const insertOrder = db.prepare(
        'INSERT INTO "order" ("id", "customer_id", "status", "total_amount", "quantity", "created_at") VALUES (?, ?, ?, ?, ?, ?)',
      );
      insertOrder.run("o1", "c1", "pending", 100.5, 2, "2025-01-15T10:00:00Z");
      insertOrder.run("o2", "c1", "shipped", 250.0, 1, "2025-01-20T14:30:00Z");
      insertOrder.run("o3", "c2", "delivered", 75.25, 3, "2025-02-01T09:00:00Z");
      insertOrder.run("o4", "c2", "pending", 300.0, 5, "2025-02-10T16:00:00Z");
    });

    it("should execute parameterized query with WHERE clause", () => {
      const query = defineQuery("getOrdersByCustomer", {
        purpose: "Fetch orders for a specific customer",
        from: "Order",
        params: {
          customerId: { type: "uuid", required: true },
        },
        returns: {
          shape: {
            id: "uuid",
            status: "string",
            totalAmount: "decimal",
          },
        },
        performance: { max_rows: 100 },
      });

      const queries = createQueryRegistry([query], schema);
      const files = generateAccessLayer(schema, queries);
      const accessFile = files.find((f) =>
        f.path.includes("get_orders_by_customer"),
      )!;
      const sql = extractSQLConstant(accessFile.content);

      const rows = db.prepare(sql).all("c1") as {
        id: string;
        status: string;
        total_amount: number;
      }[];

      expect(rows).toHaveLength(2);
      expect(rows.every((r) => typeof r.id === "string")).toBe(true);
      expect(rows.every((r) => typeof r.total_amount === "number")).toBe(true);
    });

    it("should respect ORDER BY clause", () => {
      const query = defineQuery("getOrdersByCustomer", {
        purpose: "Fetch orders sorted by amount",
        from: "Order",
        params: {
          customerId: { type: "uuid", required: true },
        },
        returns: {
          shape: {
            id: "uuid",
            totalAmount: "decimal",
          },
          ordering: [{ field: "totalAmount", direction: "desc" }],
        },
      });

      const queries = createQueryRegistry([query], schema);
      const files = generateAccessLayer(schema, queries);
      const sql = extractSQLConstant(
        files.find((f) => f.path.includes("get_orders_by_customer"))!.content,
      );

      const rows = db.prepare(sql).all("c1") as {
        id: string;
        total_amount: number;
      }[];

      expect(rows).toHaveLength(2);
      expect(rows[0]!.total_amount).toBeGreaterThanOrEqual(
        rows[1]!.total_amount,
      );
    });

    it("should respect LIMIT clause", () => {
      const query = defineQuery("getOrdersByCustomer", {
        purpose: "Fetch limited orders",
        from: "Order",
        params: {
          customerId: { type: "uuid", required: true },
        },
        returns: {
          shape: { id: "uuid" },
        },
        performance: { max_rows: 1 },
      });

      const queries = createQueryRegistry([query], schema);
      const files = generateAccessLayer(schema, queries);
      const sql = extractSQLConstant(
        files.find((f) => f.path.includes("get_orders_by_customer"))!.content,
      );

      const rows = db.prepare(sql).all("c1");
      expect(rows).toHaveLength(1);
    });

    it("should execute JOIN query for cross-entity shape fields", () => {
      const query = defineQuery("getOrdersWithCustomerName", {
        purpose: "Fetch orders with customer name",
        from: "Order",
        returns: {
          shape: {
            id: "uuid",
            status: "string",
            customerName: { from: "Customer.name", type: "string" },
          },
        },
        performance: { max_joins: 1, max_rows: 100 },
      });

      const queries = createQueryRegistry([query], schema);
      const files = generateAccessLayer(schema, queries);
      const sql = extractSQLConstant(
        files.find((f) =>
          f.path.includes("get_orders_with_customer_name"),
        )!.content,
      );

      const rows = db.prepare(sql).all() as {
        id: string;
        status: string;
        customer_name: string;
      }[];

      expect(rows).toHaveLength(4);

      const aliceOrders = rows.filter((r) => r.customer_name === "Alice");
      expect(aliceOrders).toHaveLength(2);

      const bobOrders = rows.filter((r) => r.customer_name === "Bob");
      expect(bobOrders).toHaveLength(2);
    });

    it("should execute query without parameters", () => {
      const query = defineQuery("getAllOrders", {
        purpose: "Fetch all orders",
        from: "Order",
        returns: {
          shape: {
            id: "uuid",
            status: "string",
            quantity: "integer",
          },
        },
        performance: { max_rows: 1000 },
      });

      const queries = createQueryRegistry([query], schema);
      const files = generateAccessLayer(schema, queries);
      const sql = extractSQLConstant(
        files.find((f) => f.path.includes("get_all_orders"))!.content,
      );

      const rows = db.prepare(sql).all() as {
        id: string;
        status: string;
        quantity: number;
      }[];

      expect(rows).toHaveLength(4);
      expect(rows.every((r) => typeof r.quantity === "number")).toBe(true);
    });

    it("should handle row_filter security clause", () => {
      const query = defineQuery("getOrdersByCustomer", {
        purpose: "Fetch orders with row-level security",
        from: "Order",
        params: {
          customerId: { type: "uuid", required: true },
        },
        returns: {
          shape: {
            id: "uuid",
            status: "string",
          },
        },
        security: { row_filter: "customerId" },
      });

      const queries = createQueryRegistry([query], schema);
      const files = generateAccessLayer(schema, queries);
      const sql = extractSQLConstant(
        files.find((f) => f.path.includes("get_orders_by_customer"))!.content,
      );

      // row_filter + param both bind to customerId → two ? placeholders
      const rows = db.prepare(sql).all("c2", "c2") as {
        id: string;
        status: string;
      }[];

      expect(rows).toHaveLength(2);
      expect(rows.every((r) => ["pending", "delivered"].includes(r.status))).toBe(
        true,
      );
    });

    it("should handle boolean values as integers", () => {
      const query = defineQuery("getActiveCustomers", {
        purpose: "Fetch active customers",
        from: "Customer",
        params: {
          active: { type: "boolean", required: true },
        },
        returns: {
          shape: {
            id: "uuid",
            name: "string",
            active: "boolean",
          },
        },
      });

      const queries = createQueryRegistry([query], schema);
      const files = generateAccessLayer(schema, queries);
      const sql = extractSQLConstant(
        files.find((f) => f.path.includes("get_active_customers"))!.content,
      );

      const activeRows = db.prepare(sql).all(1) as {
        id: string;
        name: string;
        active: number;
      }[];

      expect(activeRows).toHaveLength(2);
      expect(activeRows.every((r) => r.active === 1)).toBe(true);

      const inactiveRows = db.prepare(sql).all(0) as {
        id: string;
        name: string;
        active: number;
      }[];

      expect(inactiveRows).toHaveLength(1);
      expect(inactiveRows[0]!.name).toBe("Charlie");
    });

    it("should handle enum values correctly", () => {
      const query = defineQuery("getOrdersByStatus", {
        purpose: "Fetch orders by status",
        from: "Order",
        params: {
          status: { type: "string", required: true },
        },
        returns: {
          shape: {
            id: "uuid",
            totalAmount: "decimal",
          },
        },
      });

      const queries = createQueryRegistry([query], schema);
      const files = generateAccessLayer(schema, queries);
      const sql = extractSQLConstant(
        files.find((f) => f.path.includes("get_orders_by_status"))!.content,
      );

      const pending = db.prepare(sql).all("pending") as {
        id: string;
        total_amount: number;
      }[];
      expect(pending).toHaveLength(2);

      const shipped = db.prepare(sql).all("shipped") as {
        id: string;
        total_amount: number;
      }[];
      expect(shipped).toHaveLength(1);
    });

    it("should handle timestamp values as ISO-8601 text", () => {
      const query = defineQuery("getRecentOrders", {
        purpose: "Fetch orders sorted by creation time",
        from: "Order",
        returns: {
          shape: {
            id: "uuid",
            createdAt: "timestamp",
          },
          ordering: [{ field: "createdAt", direction: "desc" }],
        },
        performance: { max_rows: 10 },
      });

      const queries = createQueryRegistry([query], schema);
      const files = generateAccessLayer(schema, queries);
      const sql = extractSQLConstant(
        files.find((f) => f.path.includes("get_recent_orders"))!.content,
      );

      const rows = db.prepare(sql).all() as {
        id: string;
        created_at: string;
      }[];

      expect(rows).toHaveLength(4);
      // ISO-8601 strings sort lexicographically in DESC order
      expect(rows[0]!.created_at).toBe("2025-02-10T16:00:00Z");
      expect(rows[3]!.created_at).toBe("2025-01-15T10:00:00Z");
    });
  });

  describe("DDL with indexes", () => {
    it("should create FK indexes that are usable by queries", () => {
      const query = defineQuery("getOrdersByCustomer", {
        purpose: "Fetch orders for a customer",
        from: "Order",
        params: {
          customerId: { type: "uuid", required: true },
        },
        returns: {
          shape: { id: "uuid" },
        },
        performance: { scan_strategy: "index_only" },
      });

      const queries = createQueryRegistry([query], schema);
      const ddlFiles = generateDDL(schema, queries);
      const indexFile = ddlFiles.find((f) => f.path.includes("indexes.sql"));

      expect(indexFile).toBeDefined();

      // Create a fresh DB and apply DDL + indexes
      const freshDb = new Database(":memory:");
      freshDb.pragma("foreign_keys = ON");

      for (const file of ddlFiles) {
        const sql = extractSQL(file.content);
        if (sql.length > 0) {
          for (const stmt of sql.split(";").filter((s) => s.trim())) {
            freshDb.exec(stmt + ";");
          }
        }
      }

      // Verify index exists via EXPLAIN QUERY PLAN
      freshDb
        .prepare(
          'INSERT INTO "customer" ("id", "name", "email", "active") VALUES (?, ?, ?, ?)',
        )
        .run("c1", "Test", "test@test.com", 1);

      const plan = freshDb
        .prepare(
          'EXPLAIN QUERY PLAN SELECT "id" FROM "order" WHERE "customer_id" = ?',
        )
        .all("c1") as { detail: string }[];

      // SQLite should use the index for the customer_id lookup
      const usesIndex = plan.some((row) =>
        row.detail.includes("idx_order_customer_id"),
      );
      expect(usesIndex).toBe(true);

      freshDb.close();
    });
  });
});
