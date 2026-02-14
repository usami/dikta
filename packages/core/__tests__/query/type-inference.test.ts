import { describe, it, expectTypeOf } from "vitest";
import { defineQuery } from "../../src/query/contract.js";
import type { InferParams, InferResult, QueryContractConfig } from "../../src/query/types.js";

describe("query type inference", () => {
  describe("InferParams", () => {
    it("splits required vs optional params", () => {
      const query = defineQuery("test", {
        purpose: "test",
        from: "Order",
        params: {
          customer_id: { type: "uuid", required: true },
          status: { type: "string" },
          limit: { type: "int", default: 50 },
        },
        returns: { shape: { id: "uuid" } },
      });

      type Params = typeof query.inferParams;

      // customer_id is required (required: true, no default)
      expectTypeOf<Params>().toHaveProperty("customer_id");
      expectTypeOf<Params["customer_id"]>().toEqualTypeOf<string>();

      // status is optional (no required: true)
      expectTypeOf<Params>().toHaveProperty("status");

      // limit is optional (has default)
      expectTypeOf<Params>().toHaveProperty("limit");
    });

    it("maps param kinds to correct types", () => {
      const query = defineQuery("test", {
        purpose: "test",
        from: "Order",
        params: {
          id: { type: "uuid", required: true },
          name: { type: "string", required: true },
          count: { type: "int", required: true },
          amount: { type: "decimal", required: true },
          active: { type: "boolean", required: true },
          since: { type: "timestamp", required: true },
        },
        returns: { shape: { id: "uuid" } },
      });

      type Params = typeof query.inferParams;
      expectTypeOf<Params["id"]>().toEqualTypeOf<string>();
      expectTypeOf<Params["name"]>().toEqualTypeOf<string>();
      expectTypeOf<Params["count"]>().toEqualTypeOf<number>();
      expectTypeOf<Params["amount"]>().toEqualTypeOf<number>();
      expectTypeOf<Params["active"]>().toEqualTypeOf<boolean>();
      expectTypeOf<Params["since"]>().toEqualTypeOf<Date>();
    });

    it("returns empty object type when no params", () => {
      type Config = {
        readonly purpose: "test";
        readonly from: "Order";
        readonly returns: { readonly shape: { readonly id: "uuid" } };
      };
      expectTypeOf<InferParams<Config>>().toEqualTypeOf<Record<string, never>>();
    });

    it("treats params with default as optional even if required", () => {
      const query = defineQuery("test", {
        purpose: "test",
        from: "Order",
        params: {
          limit: { type: "int", required: true, default: 50 },
        },
        returns: { shape: { id: "uuid" } },
      });

      type Params = typeof query.inferParams;
      // Has default → optional, even though required: true
      expectTypeOf<{}>().toMatchTypeOf<Params>();
    });
  });

  describe("InferResult", () => {
    it("maps direct shape kinds to types", () => {
      const query = defineQuery("test", {
        purpose: "test",
        from: "Order",
        returns: {
          shape: {
            id: "uuid",
            name: "string",
            amount: "decimal",
            count: "integer",
            count2: "int",
            active: "boolean",
            created: "timestamp",
          },
        },
      });

      type Result = typeof query.inferResult;
      expectTypeOf<Result["id"]>().toEqualTypeOf<string>();
      expectTypeOf<Result["name"]>().toEqualTypeOf<string>();
      expectTypeOf<Result["amount"]>().toEqualTypeOf<number>();
      expectTypeOf<Result["count"]>().toEqualTypeOf<number>();
      expectTypeOf<Result["count2"]>().toEqualTypeOf<number>();
      expectTypeOf<Result["active"]>().toEqualTypeOf<boolean>();
      expectTypeOf<Result["created"]>().toEqualTypeOf<Date>();
    });

    it("defaults JOIN fields to string", () => {
      const query = defineQuery("test", {
        purpose: "test",
        from: "Order",
        returns: {
          shape: {
            customer_name: { from: "Customer.name" },
          },
        },
      });

      type Result = typeof query.inferResult;
      expectTypeOf<Result["customer_name"]>().toEqualTypeOf<string>();
    });

    it("uses explicit type for JOIN fields", () => {
      const query = defineQuery("test", {
        purpose: "test",
        from: "Order",
        returns: {
          shape: {
            customer_balance: { from: "Customer.balance", type: "decimal" },
          },
        },
      });

      type Result = typeof query.inferResult;
      expectTypeOf<Result["customer_balance"]>().toEqualTypeOf<number>();
    });
  });

  describe("literal name preservation", () => {
    it("preserves query name as literal type", () => {
      const query = defineQuery("getActiveOrders", {
        purpose: "test",
        from: "Order",
        returns: { shape: { id: "uuid" } },
      });

      expectTypeOf(query.name).toEqualTypeOf<"getActiveOrders">();
    });
  });
});
