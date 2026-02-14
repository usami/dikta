import type { FieldDefinition, CommonFieldOptions } from "./types.js";
import { extractMetadata } from "./types.js";

export type EnumFieldDefinition<V extends readonly string[]> =
  FieldDefinition<V[number], "enum"> & {
    readonly values: V;
  };

export function enumField<const V extends readonly string[]>(
  values: V,
  opts: CommonFieldOptions = {},
): EnumFieldDefinition<V> {
  return Object.freeze({
    ...extractMetadata({ role: "status", ...opts }),
    kind: "enum" as const,
    values: Object.freeze([...values]) as unknown as V,
  }) as EnumFieldDefinition<V>;
}
