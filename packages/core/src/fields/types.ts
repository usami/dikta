import type { FieldPolicy } from "../policy.js";

export type FieldKind =
  | "uuid"
  | "string"
  | "decimal"
  | "integer"
  | "boolean"
  | "timestamp"
  | "enum"
  | "ref";

export type FieldRole =
  | "identifier"
  | "monetary"
  | "audit_timestamp"
  | "display_name"
  | "description"
  | "status"
  | "quantity"
  | "reference"
  | "general";

export interface CommonFieldOptions extends FieldPolicy {
  readonly nullable?: boolean;
  readonly role?: FieldRole;
  readonly description?: string;
}

/**
 * Core field definition with phantom type `T` for type inference.
 *
 * `_type` is never assigned at runtime — it exists only so that
 * `typeof field._type` resolves to `T` at the TypeScript level.
 */
export interface FieldDefinition<T = unknown, K extends FieldKind = FieldKind> {
  readonly _type: T;
  readonly kind: K;
  readonly nullable: boolean;
  readonly role: FieldRole;
  readonly description: string;
  readonly policy: FieldPolicy;
}

export function extractPolicy(opts: CommonFieldOptions): FieldPolicy {
  return Object.freeze({
    ...(opts.pii !== undefined && { pii: opts.pii }),
    ...(opts.retention !== undefined && { retention: opts.retention }),
    ...(opts.external_exposure !== undefined && { external_exposure: opts.external_exposure }),
    ...(opts.access !== undefined && { access: opts.access }),
  });
}

export function extractMetadata(opts: CommonFieldOptions): {
  nullable: boolean;
  role: FieldRole;
  description: string;
  policy: FieldPolicy;
} {
  return {
    nullable: opts.nullable ?? false,
    role: opts.role ?? "general",
    description: opts.description ?? "",
    policy: extractPolicy(opts),
  };
}
