import type { FieldDefinition, CommonFieldOptions } from "./types.js";
import { extractMetadata } from "./types.js";

export type CascadeRule = "soft_delete" | "cascade" | "restrict" | "set_null";

export interface RefOptions extends CommonFieldOptions {
  readonly cascade?: CascadeRule;
}

export type RefFieldDefinition = FieldDefinition<string, "ref"> & {
  readonly entity: string;
  readonly cascade: CascadeRule;
};

export function ref(entity: string, opts: RefOptions = {}): RefFieldDefinition {
  return Object.freeze({
    ...extractMetadata({ role: "reference", ...opts }),
    kind: "ref" as const,
    entity,
    cascade: opts.cascade ?? "restrict",
  }) as RefFieldDefinition;
}
