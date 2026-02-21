import { describe, it, expect } from "vitest";
import { evaluateSafety } from "../src/safety.js";
import type { SchemaChange } from "../src/types.js";

describe("evaluateSafety (MySQL)", () => {
  it("should include MySQL-specific metadata lock note for rename_entity", () => {
    const changes: SchemaChange[] = [
      { kind: "rename_entity", from: "Old", to: "New" },
    ];
    const result = evaluateSafety(changes, "mysql");
    expect(result.level).toBe("caution");
    expect(result.risks[0]!.notes[0]).toContain("metadata lock");
    expect(result.risks[0]!.notes[0]).toContain("MySQL");
  });

  it("should include MySQL-specific metadata lock note for rename_field", () => {
    const changes: SchemaChange[] = [
      { kind: "rename_field", entity: "User", from: "name", to: "full_name" },
    ];
    const result = evaluateSafety(changes, "mysql");
    expect(result.risks[0]!.notes[0]).toContain("metadata lock");
  });

  it("should include ALGORITHM=INSTANT hint for nullable ADD COLUMN", () => {
    const changes: SchemaChange[] = [
      {
        kind: "add_field",
        entity: "User",
        field: "bio",
        spec: { kind: "string", nullable: true },
      },
    ];
    const result = evaluateSafety(changes, "mysql");
    expect(result.level).toBe("safe");
    expect(result.risks[0]!.notes.some((n) => n.includes("ALGORITHM=INSTANT"))).toBe(true);
  });

  it("should include ALGORITHM=COPY note for NOT NULL without backfill", () => {
    const changes: SchemaChange[] = [
      {
        kind: "add_field",
        entity: "User",
        field: "role",
        spec: { kind: "string" },
      },
    ];
    const result = evaluateSafety(changes, "mysql");
    expect(result.level).toBe("caution");
    expect(result.risks[0]!.notes[0]).toContain("ALGORITHM=COPY");
  });

  it("should include pt-online-schema-change hint for backfill step", () => {
    const changes: SchemaChange[] = [
      {
        kind: "add_field",
        entity: "User",
        field: "role",
        spec: { kind: "string" },
        backfill: "'user'",
      },
    ];
    const result = evaluateSafety(changes, "mysql");
    expect(result.risks[0]!.notes.some((n) => n.includes("pt-online-schema-change"))).toBe(true);
  });

  it("should include MODIFY COLUMN note for SET NOT NULL", () => {
    const changes: SchemaChange[] = [
      {
        kind: "alter_field",
        entity: "User",
        field: "email",
        changes: { nullable: { from: true, to: false } },
      },
    ];
    const result = evaluateSafety(changes, "mysql");
    expect(result.risks[0]!.notes[0]).toContain("MODIFY COLUMN");
    expect(result.risks[0]!.notes[0]).toContain("ALGORITHM=COPY");
  });

  it("should include ALGORITHM=COPY note for type change", () => {
    const changes: SchemaChange[] = [
      {
        kind: "alter_field",
        entity: "User",
        field: "age",
        changes: { kind: { from: "string", to: "integer" } },
      },
    ];
    const result = evaluateSafety(changes, "mysql");
    expect(result.risks[0]!.notes.some((n) => n.includes("ALGORITHM=COPY"))).toBe(true);
  });

  it("should still use PG-specific notes with default target", () => {
    const changes: SchemaChange[] = [
      { kind: "rename_entity", from: "Old", to: "New" },
    ];
    const result = evaluateSafety(changes);
    expect(result.risks[0]!.notes[0]).toContain("ACCESS EXCLUSIVE lock");
  });

  it("should produce correct safety levels (same as PG)", () => {
    // Safe
    const safeChanges: SchemaChange[] = [
      { kind: "add_entity", entity: "X", fields: { id: { kind: "uuid" } } },
    ];
    expect(evaluateSafety(safeChanges, "mysql").level).toBe("safe");

    // Dangerous
    const dangerousChanges: SchemaChange[] = [
      { kind: "remove_entity", entity: "Y" },
    ];
    expect(evaluateSafety(dangerousChanges, "mysql").level).toBe("dangerous");

    // Caution
    const cautionChanges: SchemaChange[] = [
      { kind: "rename_entity", from: "A", to: "B" },
    ];
    expect(evaluateSafety(cautionChanges, "mysql").level).toBe("caution");
  });
});
