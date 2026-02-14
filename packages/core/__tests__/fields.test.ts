import { describe, it, expect } from "vitest";
import {
  uuid,
  string,
  decimal,
  integer,
  boolean,
  timestamp,
  enumField,
  ref,
} from "../src/index.js";

describe("field builders", () => {
  describe("primitive fields", () => {
    it("uuid has correct kind and default role", () => {
      const field = uuid();
      expect(field.kind).toBe("uuid");
      expect(field.role).toBe("identifier");
    });

    it("string has correct kind and default role", () => {
      const field = string();
      expect(field.kind).toBe("string");
      expect(field.role).toBe("general");
    });

    it("decimal has correct kind", () => {
      const field = decimal({ role: "monetary" });
      expect(field.kind).toBe("decimal");
      expect(field.role).toBe("monetary");
    });

    it("integer has correct kind", () => {
      const field = integer();
      expect(field.kind).toBe("integer");
    });

    it("boolean has correct kind", () => {
      const field = boolean();
      expect(field.kind).toBe("boolean");
    });

    it("timestamp has correct kind and default role", () => {
      const field = timestamp();
      expect(field.kind).toBe("timestamp");
      expect(field.role).toBe("audit_timestamp");
    });
  });

  describe("policy extraction", () => {
    it("extracts pii policy", () => {
      const field = string({ pii: true, retention: "audit" });
      expect(field.policy.pii).toBe(true);
      expect(field.policy.retention).toBe("audit");
    });

    it("extracts access policy", () => {
      const field = uuid({ access: "immutable" });
      expect(field.policy.access).toBe("immutable");
    });

    it("extracts external_exposure policy", () => {
      const field = string({ external_exposure: "restricted" });
      expect(field.policy.external_exposure).toBe("restricted");
    });

    it("policy is empty when no policy options given", () => {
      const field = string();
      expect(field.policy).toEqual({});
    });
  });

  describe("nullable fields", () => {
    it("defaults to non-nullable", () => {
      const field = string();
      expect(field.nullable).toBe(false);
    });

    it("respects nullable option", () => {
      const field = string({ nullable: true });
      expect(field.nullable).toBe(true);
    });
  });

  describe("immutability", () => {
    it("field objects are frozen", () => {
      const field = string();
      expect(Object.isFrozen(field)).toBe(true);
    });

    it("enum field is frozen", () => {
      const field = enumField(["a", "b"]);
      expect(Object.isFrozen(field)).toBe(true);
    });

    it("ref field is frozen", () => {
      const field = ref("User");
      expect(Object.isFrozen(field)).toBe(true);
    });
  });

  describe("enum fields", () => {
    it("has correct kind and values", () => {
      const field = enumField(["active", "inactive"]);
      expect(field.kind).toBe("enum");
      expect(field.values).toEqual(["active", "inactive"]);
    });

    it("defaults to status role", () => {
      const field = enumField(["a", "b"]);
      expect(field.role).toBe("status");
    });
  });

  describe("ref fields", () => {
    it("has correct kind and entity", () => {
      const field = ref("Customer");
      expect(field.kind).toBe("ref");
      expect(field.entity).toBe("Customer");
    });

    it("defaults to restrict cascade", () => {
      const field = ref("Customer");
      expect(field.cascade).toBe("restrict");
    });

    it("respects cascade option", () => {
      const field = ref("Customer", { cascade: "cascade" });
      expect(field.cascade).toBe("cascade");
    });

    it("defaults to reference role", () => {
      const field = ref("User");
      expect(field.role).toBe("reference");
    });
  });
});
