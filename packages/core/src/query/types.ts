// ── Param types ──────────────────────────────────────────────

/** Parameter kinds for query contracts. Uses "int" (not "integer") per spec. */
export type ParamKind =
  | "uuid"
  | "string"
  | "int"
  | "decimal"
  | "boolean"
  | "timestamp";

/** Maps param kind literals to their TypeScript types. */
export type ParamKindToType = {
  uuid: string;
  string: string;
  int: number;
  decimal: number;
  boolean: boolean;
  timestamp: Date;
};

export interface ParamDefinition<K extends ParamKind = ParamKind> {
  readonly type: K;
  readonly required?: boolean;
  readonly default?: ParamKindToType[K];
}

// ── Shape types ──────────────────────────────────────────────

/** Shape kinds — accepts both "int" and "integer" for flexibility. */
export type ShapeKind =
  | "uuid"
  | "string"
  | "decimal"
  | "integer"
  | "int"
  | "boolean"
  | "timestamp";

/** Maps shape kind literals to their TypeScript types. */
export type ShapeKindToType = {
  uuid: string;
  string: string;
  decimal: number;
  integer: number;
  int: number;
  boolean: boolean;
  timestamp: Date;
};

/** JOIN shape field — references "entity.field" with optional explicit type. */
export interface JoinShapeField {
  readonly from: string;
  readonly type?: ShapeKind;
}

/** A shape field is either a direct kind or a JOIN reference. */
export type ShapeField = ShapeKind | JoinShapeField;

// ── Query configuration types ────────────────────────────────

export interface OrderingSpec {
  readonly field: string;
  readonly direction: "asc" | "desc";
}

export type PaginationKind = "cursor" | "offset";

export interface ReturnsDefinition {
  readonly shape: Record<string, ShapeField>;
  readonly ordering?: readonly OrderingSpec[];
  readonly pagination?: PaginationKind;
}

export type ScanStrategy = "index_only" | "seq_scan_ok";

export interface PerformanceContract {
  readonly max_rows?: number;
  readonly scan_strategy?: ScanStrategy;
  readonly max_joins?: number;
}

export interface SecurityContract {
  readonly row_filter?: string;
  readonly pii_fields?: readonly string[];
}

export interface QueryContractConfig {
  readonly purpose: string;
  readonly from: string;
  readonly params?: Record<string, ParamDefinition>;
  readonly returns: ReturnsDefinition;
  readonly performance?: PerformanceContract;
  readonly security?: SecurityContract;
}

// ── Query contract result ────────────────────────────────────

export interface QueryContract<
  Name extends string = string,
  Config extends QueryContractConfig = QueryContractConfig,
> {
  readonly name: Name;
  readonly config: Config;
  /** Phantom — use `typeof query.inferParams` to extract the params type. */
  readonly inferParams: InferParams<Config>;
  /** Phantom — use `typeof query.inferResult` to extract the result type. */
  readonly inferResult: InferResult<Config>;
}

// ── Type inference utilities ─────────────────────────────────

/** Flatten intersection types into a single clean object. */
type Prettify<T> = { [K in keyof T]: T[K] } & {};

/** Extract keys where the param is required (required: true AND no default). */
type RequiredParamKeys<Params extends Record<string, ParamDefinition>> = {
  [K in keyof Params]: Params[K] extends { readonly required: true }
    ? Params[K] extends { readonly default: unknown }
      ? never
      : K
    : never;
}[keyof Params];

/** Extract keys where the param is optional. */
type OptionalParamKeys<Params extends Record<string, ParamDefinition>> = Exclude<
  keyof Params,
  RequiredParamKeys<Params>
>;

/** Infer the TypeScript type for query params from a config. */
export type InferParams<Config extends QueryContractConfig> =
  Config extends { readonly params: infer P extends Record<string, ParamDefinition> }
    ? Prettify<
        { readonly [K in RequiredParamKeys<P>]: ParamKindToType[P[K]["type"]] } &
        { readonly [K in OptionalParamKeys<P>]?: ParamKindToType[P[K]["type"]] }
      >
    : Record<string, never>;

/** Infer the TypeScript type for a single shape field. */
type InferShapeField<F extends ShapeField> =
  F extends ShapeKind
    ? ShapeKindToType[F]
    : F extends JoinShapeField
      ? F extends { readonly type: infer T extends ShapeKind }
        ? ShapeKindToType[T]
        : string  // JOIN fields default to string
      : never;

/** Infer the TypeScript type for query results from a config. */
export type InferResult<Config extends QueryContractConfig> = Prettify<{
  readonly [K in keyof Config["returns"]["shape"]]: InferShapeField<Config["returns"]["shape"][K]>;
}>;
