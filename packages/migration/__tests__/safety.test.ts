import { describe, it, expect } from "vitest";
import { evaluateSafety } from "../src/safety.js";
import type { SchemaChange } from "../src/types.js";

describe("evaluateSafety", () => {
  it("should evaluate add_entity as safe", () => {
    const changes: SchemaChange[] = [
      { kind: "add_entity", entity: "User", fields: { id: { kind: "uuid" } } },
    ];
    const result = evaluateSafety(changes);
    expect(result.level).toBe("safe");
    expect(result.risks[0]!.online).toBe(true);
    expect(result.risks[0]!.dataLoss).toBe(false);
    expect(result.risks[0]!.reversible).toBe(true);
  });

  it("should evaluate remove_entity as dangerous", () => {
    const changes: SchemaChange[] = [
      { kind: "remove_entity", entity: "OldTable" },
    ];
    const result = evaluateSafety(changes);
    expect(result.level).toBe("dangerous");
    expect(result.risks[0]!.dataLoss).toBe(true);
    expect(result.risks[0]!.reversible).toBe(false);
  });

  it("should evaluate rename_entity as caution", () => {
    const changes: SchemaChange[] = [
      { kind: "rename_entity", from: "Old", to: "New" },
    ];
    const result = evaluateSafety(changes);
    expect(result.level).toBe("caution");
    expect(result.risks[0]!.online).toBe(false);
  });

  it("should evaluate add_field (nullable) as safe", () => {
    const changes: SchemaChange[] = [
      {
        kind: "add_field",
        entity: "User",
        field: "bio",
        spec: { kind: "string", nullable: true },
      },
    ];
    const result = evaluateSafety(changes);
    expect(result.level).toBe("safe");
    expect(result.risks[0]!.online).toBe(true);
  });

  it("should evaluate add_field (NOT NULL without backfill) as caution", () => {
    const changes: SchemaChange[] = [
      {
        kind: "add_field",
        entity: "User",
        field: "role",
        spec: { kind: "string" },
      },
    ];
    const result = evaluateSafety(changes);
    expect(result.level).toBe("caution");
    expect(result.risks[0]!.online).toBe(false);
  });

  it("should evaluate add_field (NOT NULL with backfill) as caution", () => {
    const changes: SchemaChange[] = [
      {
        kind: "add_field",
        entity: "User",
        field: "role",
        spec: { kind: "string" },
        backfill: "'user'",
      },
    ];
    const result = evaluateSafety(changes);
    expect(result.level).toBe("caution");
    expect(result.risks[0]!.online).toBe(false);
  });

  it("should evaluate remove_field as dangerous", () => {
    const changes: SchemaChange[] = [
      { kind: "remove_field", entity: "User", field: "legacy" },
    ];
    const result = evaluateSafety(changes);
    expect(result.level).toBe("dangerous");
    expect(result.risks[0]!.dataLoss).toBe(true);
  });

  it("should evaluate rename_field as caution", () => {
    const changes: SchemaChange[] = [
      { kind: "rename_field", entity: "User", from: "name", to: "full_name" },
    ];
    const result = evaluateSafety(changes);
    expect(result.level).toBe("caution");
    expect(result.risks[0]!.online).toBe(false);
    expect(result.risks[0]!.reversible).toBe(true);
  });

  it("should evaluate alter_field (nullable->not null) as caution", () => {
    const changes: SchemaChange[] = [
      {
        kind: "alter_field",
        entity: "User",
        field: "email",
        changes: { nullable: { from: true, to: false } },
      },
    ];
    const result = evaluateSafety(changes);
    expect(result.level).toBe("caution");
    expect(result.risks[0]!.online).toBe(false);
  });

  it("should evaluate alter_field (not null->nullable) as safe", () => {
    const changes: SchemaChange[] = [
      {
        kind: "alter_field",
        entity: "User",
        field: "email",
        changes: { nullable: { from: false, to: true } },
      },
    ];
    const result = evaluateSafety(changes);
    expect(result.level).toBe("safe");
    expect(result.risks[0]!.online).toBe(true);
  });

  it("should evaluate alter_field (enum values removed) as dangerous", () => {
    const changes: SchemaChange[] = [
      {
        kind: "alter_field",
        entity: "Order",
        field: "status",
        changes: {
          values: { added: [], removed: ["cancelled"] },
        },
      },
    ];
    const result = evaluateSafety(changes);
    expect(result.level).toBe("dangerous");
    expect(result.risks[0]!.dataLoss).toBe(true);
    expect(result.risks[0]!.reversible).toBe(false);
  });

  it("should evaluate invariant changes as safe", () => {
    const changes: SchemaChange[] = [
      { kind: "add_invariant", entity: "Order", invariant: "total >= 0" },
      { kind: "remove_invariant", entity: "Order", invariant: "old_rule" },
    ];
    const result = evaluateSafety(changes);
    expect(result.level).toBe("safe");
  });

  it("should aggregate to worst-case level", () => {
    const changes: SchemaChange[] = [
      // safe
      { kind: "add_entity", entity: "X", fields: { id: { kind: "uuid" } } },
      // dangerous
      { kind: "remove_entity", entity: "Y" },
    ];
    const result = evaluateSafety(changes);
    expect(result.level).toBe("dangerous");
  });

  it("should produce a summary string", () => {
    const changes: SchemaChange[] = [
      { kind: "remove_entity", entity: "Y" },
    ];
    const result = evaluateSafety(changes);
    expect(result.summary).toContain("DANGEROUS");
    expect(result.summary).toContain("1 change(s)");
    expect(result.summary).toContain("data loss");
  });
});
