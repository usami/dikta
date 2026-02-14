import { describe, it, expectTypeOf } from "vitest";
import {
  uuid,
  string,
  decimal,
  integer,
  boolean,
  timestamp,
  enumField,
  ref,
  defineEntity,
  type InferFieldType,
} from "../src/index.js";

describe("type inference", () => {
  describe("primitive field types", () => {
    it("uuid infers to string", () => {
      const field = uuid();
      expectTypeOf<InferFieldType<typeof field>>().toEqualTypeOf<string>();
    });

    it("string infers to string", () => {
      const field = string();
      expectTypeOf<InferFieldType<typeof field>>().toEqualTypeOf<string>();
    });

    it("decimal infers to number", () => {
      const field = decimal();
      expectTypeOf<InferFieldType<typeof field>>().toEqualTypeOf<number>();
    });

    it("integer infers to number", () => {
      const field = integer();
      expectTypeOf<InferFieldType<typeof field>>().toEqualTypeOf<number>();
    });

    it("boolean infers to boolean", () => {
      const field = boolean();
      expectTypeOf<InferFieldType<typeof field>>().toEqualTypeOf<boolean>();
    });

    it("timestamp infers to Date", () => {
      const field = timestamp();
      expectTypeOf<InferFieldType<typeof field>>().toEqualTypeOf<Date>();
    });

    it("ref infers to string", () => {
      const field = ref("User");
      expectTypeOf<InferFieldType<typeof field>>().toEqualTypeOf<string>();
    });
  });

  describe("enum field type inference", () => {
    it("enum infers union of literal values", () => {
      const field = enumField(["active", "inactive", "suspended"]);
      expectTypeOf<InferFieldType<typeof field>>().toEqualTypeOf<
        "active" | "inactive" | "suspended"
      >();
    });

    it("enum with two values infers correct union", () => {
      const field = enumField(["yes", "no"]);
      expectTypeOf<InferFieldType<typeof field>>().toEqualTypeOf<"yes" | "no">();
    });
  });

  describe("entity type inference", () => {
    it("entity.infer produces correct shape", () => {
      const order = defineEntity({
        name: "Order",
        fields: {
          id: uuid(),
          customer_name: string(),
          total: decimal({ role: "monetary" }),
          quantity: integer({ role: "quantity" }),
          is_paid: boolean(),
          created_at: timestamp(),
          status: enumField(["pending", "shipped", "delivered"]),
          customer_id: ref("Customer"),
        },
      });

      type OrderType = typeof order.infer;

      expectTypeOf<OrderType>().toEqualTypeOf<{
        readonly id: string;
        readonly customer_name: string;
        readonly total: number;
        readonly quantity: number;
        readonly is_paid: boolean;
        readonly created_at: Date;
        readonly status: "pending" | "shipped" | "delivered";
        readonly customer_id: string;
      }>();
    });

    it("entity name is preserved as literal type", () => {
      const user = defineEntity({
        name: "User",
        fields: { id: uuid() },
      });

      expectTypeOf(user.name).toEqualTypeOf<"User">();
    });
  });
});
