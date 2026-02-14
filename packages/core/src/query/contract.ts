import type { QueryContractConfig, QueryContract } from "./types.js";

export function defineQuery<
  const Name extends string,
  const Config extends QueryContractConfig,
>(
  name: Name,
  config: Config,
): QueryContract<Name, Config> {
  if (!name) {
    throw new Error("Query name must not be empty");
  }
  if (!config.purpose) {
    throw new Error(`Query "${name}": purpose must not be empty`);
  }
  if (!config.from) {
    throw new Error(`Query "${name}": from must not be empty`);
  }

  return Object.freeze({
    name,
    config: Object.freeze({
      ...config,
      params: config.params ? Object.freeze({ ...config.params }) : undefined,
      returns: Object.freeze({
        ...config.returns,
        shape: Object.freeze({ ...config.returns.shape }),
        ordering: config.returns.ordering
          ? Object.freeze([...config.returns.ordering])
          : undefined,
      }),
      performance: Object.freeze({ ...config.performance }),
      security: Object.freeze({ ...config.security }),
    }),
  }) as QueryContract<Name, Config>;
}
