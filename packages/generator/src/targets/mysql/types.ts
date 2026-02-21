import type { FieldKind, FieldRole, ParamKind, ShapeKind, CascadeRule } from "@dikta/core";

// ── FieldKind -> MySQL column type ──────────────────────────

interface MySQLColumnType {
  readonly type: string;
  readonly roleOverrides?: Partial<Record<FieldRole, string>>;
}

const FIELD_KIND_TO_MYSQL: Record<FieldKind, MySQLColumnType> = {
  uuid: { type: "CHAR(36)" },
  string: { type: "VARCHAR(255)" },
  decimal: { type: "DECIMAL", roleOverrides: { monetary: "DECIMAL(19,4)" } },
  integer: { type: "INT" },
  boolean: { type: "BOOLEAN" },
  timestamp: { type: "DATETIME" },
  enum: { type: "ENUM" }, // Placeholder — actual ENUM values injected in DDL
  ref: { type: "CHAR(36)" },
} as const;

export function fieldKindToMySQLType(kind: FieldKind, role: FieldRole): string {
  const mapping = FIELD_KIND_TO_MYSQL[kind];
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

// ── CascadeRule -> MySQL ON DELETE clause ────────────────────

const CASCADE_TO_MYSQL: Record<CascadeRule, string | null> = {
  cascade: "ON DELETE CASCADE",
  restrict: "ON DELETE RESTRICT",
  set_null: "ON DELETE SET NULL",
  soft_delete: null,
} as const;

export function cascadeRuleToMySQL(rule: CascadeRule): string | null {
  return CASCADE_TO_MYSQL[rule];
}
