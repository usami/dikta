import { describe, it, expect } from "vitest";
import { evaluateSafety } from "../src/safety.js";
import type { SchemaChange } from "../src/types.js";

describe("evaluateSafety (SQLite)", () => {
  it("should include EXCLUSIVE file-level lock note for rename_entity", () => {
    const changes: SchemaChange[] = [
      { kind: "rename_entity", from: "Old", to: "New" },
    ];
    const result = evaluateSafety(changes, "sqlite");
    expect(result.level).toBe("caution");
    expect(result.risks[0]!.notes[0]).toContain("EXCLUSIVE");
    expect(result.risks[0]!.notes[0]).toContain("file-level lock");
  });

  it("should include EXCLUSIVE file-level lock note for rename_field", () => {
    const changes: SchemaChange[] = [
      { kind: "rename_field", entity: "User", from: "name", to: "full_name" },
    ];
    const result = evaluateSafety(changes, "sqlite");
    expect(result.risks[0]!.notes[0]).toContain("EXCLUSIVE");
    expect(result.risks[0]!.notes[0]).toContain("SQLite");
  });

  it("should note DEFAULT requirement for NOT NULL ADD COLUMN", () => {
    const changes: SchemaChange[] = [
      {
        kind: "add_field",
        entity: "User",
        field: "role",
        spec: { kind: "string" },
      },
    ];
    const result = evaluateSafety(changes, "sqlite");
    expect(result.level).toBe("caution");
    expect(result.risks[0]!.notes[0]).toContain("DEFAULT");
    expect(result.risks[0]!.notes[0]).toContain("SQLite");
  });

  it("should note no online schema change tools for backfill step", () => {
    const changes: SchemaChange[] = [
      {
        kind: "add_field",
        entity: "User",
        field: "role",
        spec: { kind: "string" },
        backfill: "'user'",
      },
    ];
    const result = evaluateSafety(changes, "sqlite");
    expect(result.risks[0]!.notes.some((n) => n.includes("no online schema change"))).toBe(true);
  });

  it("should note table rebuild for SET NOT NULL", () => {
    const changes: SchemaChange[] = [
      {
        kind: "alter_field",
        entity: "User",
        field: "email",
        changes: { nullable: { from: true, to: false } },
      },
    ];
    const result = evaluateSafety(changes, "sqlite");
    expect(result.risks[0]!.notes[0]).toContain("table rebuild");
    expect(result.risks[0]!.notes[0]).toContain("SQLite");
  });

  it("should note table rebuild for type change", () => {
    const changes: SchemaChange[] = [
      {
        kind: "alter_field",
        entity: "User",
        field: "age",
        changes: { kind: { from: "string", to: "integer" } },
      },
    ];
    const result = evaluateSafety(changes, "sqlite");
    expect(result.risks[0]!.notes.some((n) => n.includes("table rebuild"))).toBe(true);
    expect(result.risks[0]!.notes.some((n) => n.includes("SQLite"))).toBe(true);
  });

  it("should be safe for nullable ADD COLUMN", () => {
    const changes: SchemaChange[] = [
      {
        kind: "add_field",
        entity: "User",
        field: "bio",
        spec: { kind: "string", nullable: true },
      },
    ];
    const result = evaluateSafety(changes, "sqlite");
    expect(result.level).toBe("safe");
  });

  it("should produce correct safety levels", () => {
    // Safe
    const safeChanges: SchemaChange[] = [
      { kind: "add_entity", entity: "X", fields: { id: { kind: "uuid" } } },
    ];
    expect(evaluateSafety(safeChanges, "sqlite").level).toBe("safe");

    // Dangerous
    const dangerousChanges: SchemaChange[] = [
      { kind: "remove_entity", entity: "Y" },
    ];
    expect(evaluateSafety(dangerousChanges, "sqlite").level).toBe("dangerous");

    // Caution
    const cautionChanges: SchemaChange[] = [
      { kind: "rename_entity", from: "A", to: "B" },
    ];
    expect(evaluateSafety(cautionChanges, "sqlite").level).toBe("caution");
  });
});
