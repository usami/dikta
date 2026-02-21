import type { FieldKind, FieldRole, ParamKind, ShapeKind, CascadeRule } from "@dikta/core";

// ── FieldKind -> SQLite column type ──────────────────────────

interface SQLiteColumnType {
  readonly type: string;
  readonly roleOverrides?: Partial<Record<FieldRole, string>>;
}

const FIELD_KIND_TO_SQLITE: Record<FieldKind, SQLiteColumnType> = {
  uuid: { type: "TEXT" },
  string: { type: "TEXT" },
  decimal: { type: "REAL", roleOverrides: { monetary: "REAL" } },
  integer: { type: "INTEGER" },
  boolean: { type: "INTEGER" },
  timestamp: { type: "TEXT" },
  enum: { type: "TEXT" },
  ref: { type: "TEXT" },
} as const;

export function fieldKindToSQLiteType(kind: FieldKind, role: FieldRole): string {
  const mapping = FIELD_KIND_TO_SQLITE[kind];
  return mapping.roleOverrides?.[role] ?? mapping.type;
}

// ── ParamKind -> TypeScript type string ─────────────────────

const PARAM_KIND_TO_TS: Record<ParamKind, string> = {
  uuid: "string",
  string: "string",
  int: "number",
  decimal: "number",
  boolean: "boolean",
  timestamp: "string",
} as const;

export function paramKindToTSType(kind: ParamKind): string {
  return PARAM_KIND_TO_TS[kind];
}

// ── ShapeKind -> TypeScript type string ─────────────────────

const SHAPE_KIND_TO_TS: Record<ShapeKind, string> = {
  uuid: "string",
  string: "string",
  decimal: "number",
  integer: "number",
  int: "number",
  boolean: "number",
  timestamp: "string",
} as const;

export function shapeKindToTSType(kind: ShapeKind): string {
  return SHAPE_KIND_TO_TS[kind];
}

// ── CascadeRule -> SQLite ON DELETE clause ────────────────────

const CASCADE_TO_SQLITE: Record<CascadeRule, string | null> = {
  cascade: "ON DELETE CASCADE",
  restrict: "ON DELETE RESTRICT",
  set_null: "ON DELETE SET NULL",
  soft_delete: null,
} as const;

export function cascadeRuleToSQLite(rule: CascadeRule): string | null {
  return CASCADE_TO_SQLITE[rule];
}
