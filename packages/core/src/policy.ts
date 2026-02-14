export interface FieldPolicy {
  readonly pii?: boolean;
  readonly retention?: "permanent" | "transient" | "audit";
  readonly external_exposure?: "public" | "internal" | "restricted";
  readonly access?: "read" | "write" | "immutable";
}
