import { describe, it, expect } from "vitest";
import { ref, enumField, string, uuid, integer } from "@dikta/core";
import {
  defineMigration,
  addEntity,
  removeEntity,
  renameEntity,
  addField,
  removeField,
  renameField,
  alterField,
  addInvariant,
  removeInvariant,
  fieldDefinitionToSpec,
} from "../src/definition.js";

describe("change builders", () => {
  it("should create addEntity change", () => {
    const change = addEntity("User", {
      id: { kind: "uuid", role: "identifier" },
      name: { kind: "string" },
    });

    expect(change.kind).toBe("add_entity");
    expect(change.entity).toBe("User");
    expect(Object.keys(change.fields)).toEqual(["id", "name"]);
    expect(Object.isFrozen(change)).toBe(true);
    expect(Object.isFrozen(change.fields)).toBe(true);
  });

  it("should create removeEntity change", () => {
    const change = removeEntity("OldTable");
    expect(change.kind).toBe("remove_entity");
    expect(change.entity).toBe("OldTable");
    expect(Object.isFrozen(change)).toBe(true);
  });

  it("should create renameEntity change", () => {
    const change = renameEntity("OldName", "NewName");
    expect(change.kind).toBe("rename_entity");
    expect(change.from).toBe("OldName");
    expect(change.to).toBe("NewName");
    expect(Object.isFrozen(change)).toBe(true);
  });

  it("should create addField change with FieldSpec", () => {
    const change = addField("User", "email", { kind: "string" });
    expect(change.kind).toBe("add_field");
    expect(change.entity).toBe("User");
    expect(change.field).toBe("email");
    expect(change.spec.kind).toBe("string");
  });

  it("should create addField change with FieldDefinition (ref)", () => {
    const change = addField("Order", "customer_id", ref("Customer"));
    expect(change.kind).toBe("add_field");
    expect(change.spec.kind).toBe("ref");
    expect(change.spec.entity).toBe("Customer");
    expect(change.spec.cascade).toBe("restrict");
  });

  it("should create addField change with backfill", () => {
    const change = addField(
      "User",
      "status",
      { kind: "string" },
      { backfill: "'active'" },
    );
    expect(change.backfill).toBe("'active'");
  });

  it("should create removeField change", () => {
    const change = removeField("User", "legacy_col");
    expect(change.kind).toBe("remove_field");
    expect(change.entity).toBe("User");
    expect(change.field).toBe("legacy_col");
  });

  it("should create renameField change", () => {
    const change = renameField("User", "oldName", "newName");
    expect(change.kind).toBe("rename_field");
    expect(change.from).toBe("oldName");
    expect(change.to).toBe("newName");
  });

  it("should create alterField change", () => {
    const change = alterField("User", "age", {
      nullable: { from: true, to: false },
    });
    expect(change.kind).toBe("alter_field");
    expect(change.changes.nullable?.from).toBe(true);
    expect(change.changes.nullable?.to).toBe(false);
  });

  it("should create addInvariant change", () => {
    const change = addInvariant("Order", "total >= 0");
    expect(change.kind).toBe("add_invariant");
    expect(change.invariant).toBe("total >= 0");
  });

  it("should create removeInvariant change", () => {
    const change = removeInvariant("Order", "total >= 0");
    expect(change.kind).toBe("remove_invariant");
    expect(change.invariant).toBe("total >= 0");
  });
});

describe("fieldDefinitionToSpec", () => {
  it("should convert ref() to FieldSpec", () => {
    const spec = fieldDefinitionToSpec(ref("Customer", { cascade: "cascade" }));
    expect(spec.kind).toBe("ref");
    expect(spec.entity).toBe("Customer");
    expect(spec.cascade).toBe("cascade");
    expect(spec.role).toBe("reference");
  });

  it("should convert enumField() to FieldSpec", () => {
    const spec = fieldDefinitionToSpec(enumField(["active", "inactive"]));
    expect(spec.kind).toBe("enum");
    expect(spec.values).toEqual(["active", "inactive"]);
  });

  it("should convert string() with options", () => {
    const spec = fieldDefinitionToSpec(
      string({ nullable: true, pii: true, description: "Email" }),
    );
    expect(spec.kind).toBe("string");
    expect(spec.nullable).toBe(true);
    expect(spec.policy?.pii).toBe(true);
    expect(spec.description).toBe("Email");
  });

  it("should omit default values", () => {
    // uuid() defaults to role: "identifier" (not "general")
    const spec = fieldDefinitionToSpec(uuid());
    expect(spec.kind).toBe("uuid");
    expect(spec.nullable).toBeUndefined();
    expect(spec.role).toBe("identifier"); // uuid() defaults to "identifier"
    expect(spec.description).toBeUndefined(); // "" is default

    // string() defaults to role: "general"
    const strSpec = fieldDefinitionToSpec(string());
    expect(strSpec.role).toBeUndefined(); // "general" is omitted
  });
});

describe("defineMigration", () => {
  it("should create a frozen MigrationDefinition", () => {
    const migration = defineMigration("add_email_to_user", {
      changes: [addField("User", "email", { kind: "string", nullable: true })],
      description: "Add email field",
    });

    expect(migration.name).toBe("add_email_to_user");
    expect(migration.config.changes).toHaveLength(1);
    expect(migration.config.description).toBe("Add email field");
    expect(Object.isFrozen(migration)).toBe(true);
    expect(Object.isFrozen(migration.config)).toBe(true);
  });

  it("should throw on empty name", () => {
    expect(() =>
      defineMigration("", { changes: [removeEntity("X")] }),
    ).toThrow("Migration name must not be empty");
  });

  it("should throw on empty changes", () => {
    expect(() =>
      defineMigration("noop", { changes: [] }),
    ).toThrow("Migration must contain at least one change");
  });

  it("should validate add_entity requires fields", () => {
    expect(() =>
      defineMigration("bad", {
        changes: [{ kind: "add_entity", entity: "X", fields: {} }],
      }),
    ).toThrow('add_entity "X" requires at least one field');
  });

  it("should validate alter_field requires changes", () => {
    expect(() =>
      defineMigration("bad", {
        changes: [{ kind: "alter_field", entity: "X", field: "y", changes: {} }],
      }),
    ).toThrow("requires at least one alteration");
  });
});
