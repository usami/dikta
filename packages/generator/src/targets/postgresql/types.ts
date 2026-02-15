import type { FieldKind, FieldRole, ParamKind, ShapeKind, CascadeRule } from "@dikta/core";

// ── FieldKind -> PostgreSQL column type ─────────────────────

interface PGColumnType {
  readonly type: string;
  readonly roleOverrides?: Partial<Record<FieldRole, string>>;
}

const FIELD_KIND_TO_PG: Record<FieldKind, PGColumnType> = {
  uuid: { type: "UUID" },
  string: { type: "TEXT" },
  decimal: { type: "NUMERIC", roleOverrides: { monetary: "NUMERIC(19,4)" } },
  integer: { type: "INTEGER" },
  boolean: { type: "BOOLEAN" },
  timestamp: { type: "TIMESTAMPTZ" },
  enum: { type: "TEXT" },
  ref: { type: "UUID" },
} as const;

export function fieldKindToPGType(kind: FieldKind, role: FieldRole): string {
  const mapping = FIELD_KIND_TO_PG[kind];
  return mapping.roleOverrides?.[role] ?? mapping.type;
}

// ── ParamKind -> TypeScript type string ─────────────────────

const PARAM_KIND_TO_TS: Record<ParamKind, string> = {
  uuid: "string",
  string: "string",
  int: "number",
  decimal: "number",
  boolean: "boolean",
  timestamp: "Date",
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
  boolean: "boolean",
  timestamp: "Date",
} as const;

export function shapeKindToTSType(kind: ShapeKind): string {
  return SHAPE_KIND_TO_TS[kind];
}

// ── CascadeRule -> PostgreSQL ON DELETE clause ───────────────

const CASCADE_TO_PG: Record<CascadeRule, string | null> = {
  cascade: "ON DELETE CASCADE",
  restrict: "ON DELETE RESTRICT",
  set_null: "ON DELETE SET NULL",
  soft_delete: null,
} as const;

export function cascadeRuleToPG(rule: CascadeRule): string | null {
  return CASCADE_TO_PG[rule];
}
