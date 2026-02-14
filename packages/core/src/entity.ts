import type { FieldDefinition, FieldKind } from "./fields/types.js";
import type { Invariant } from "./invariant.js";

/**
 * Extract the phantom TypeScript type from a FieldDefinition.
 * If nullable, unions with null.
 */
export type InferFieldType<F> =
  F extends FieldDefinition<infer T, infer _K>
    ? F extends { readonly nullable: true }
      ? T | null
      : T
    : never;

/**
 * Map a record of field definitions to their inferred TypeScript types.
 */
export type InferEntityFields<Fields extends Record<string, FieldDefinition>> = {
  readonly [K in keyof Fields]: InferFieldType<Fields[K]>;
};

export interface QueryHints {
  readonly scan_strategy?: "index_only" | "seq_scan_ok";
  readonly expected_row_count?: "single" | "few" | "many";
}

export interface EntityDefinitionOptions<
  Name extends string,
  Fields extends Record<string, FieldDefinition<unknown, FieldKind>>,
> {
  readonly name: Name;
  readonly fields: Fields;
  readonly invariants?: readonly Invariant[];
  readonly query_hints?: QueryHints;
}

export interface EntityDefinition<
  Name extends string = string,
  Fields extends Record<string, FieldDefinition<unknown, FieldKind>> = Record<string, FieldDefinition>,
> {
  readonly name: Name;
  readonly fields: Fields;
  readonly invariants: readonly Invariant[];
  readonly query_hints: QueryHints;
  /** Phantom property — use `typeof entity.infer` to extract the TS type. */
  readonly infer: InferEntityFields<Fields>;
}

export function defineEntity<
  const Name extends string,
  const Fields extends Record<string, FieldDefinition<unknown, FieldKind>>,
>(
  options: EntityDefinitionOptions<Name, Fields>,
): EntityDefinition<Name, Fields> {
  if (!options.name) {
    throw new Error("Entity name must not be empty");
  }

  return Object.freeze({
    name: options.name,
    fields: Object.freeze({ ...options.fields }),
    invariants: Object.freeze([...(options.invariants ?? [])]),
    query_hints: Object.freeze({ ...options.query_hints }),
  }) as EntityDefinition<Name, Fields>;
}
