import type { FieldDefinition, CommonFieldOptions } from "./types.js";
import { extractMetadata } from "./types.js";

function createField<T, K extends string>(
  kind: K,
  opts: CommonFieldOptions,
): FieldDefinition<T, K extends FieldDefinition["kind"] ? K : never> {
  return Object.freeze({
    ...extractMetadata(opts),
    kind,
  }) as FieldDefinition<T, K extends FieldDefinition["kind"] ? K : never>;
}

export function uuid(opts: CommonFieldOptions = {}): FieldDefinition<string, "uuid"> {
  return createField<string, "uuid">("uuid", { role: "identifier", ...opts });
}

export function string(opts: CommonFieldOptions = {}): FieldDefinition<string, "string"> {
  return createField<string, "string">("string", opts);
}

export function decimal(opts: CommonFieldOptions = {}): FieldDefinition<number, "decimal"> {
  return createField<number, "decimal">("decimal", opts);
}

export function integer(opts: CommonFieldOptions = {}): FieldDefinition<number, "integer"> {
  return createField<number, "integer">("integer", opts);
}

export function boolean(opts: CommonFieldOptions = {}): FieldDefinition<boolean, "boolean"> {
  return createField<boolean, "boolean">("boolean", opts);
}

export function timestamp(opts: CommonFieldOptions = {}): FieldDefinition<Date, "timestamp"> {
  return createField<Date, "timestamp">("timestamp", { role: "audit_timestamp", ...opts });
}
