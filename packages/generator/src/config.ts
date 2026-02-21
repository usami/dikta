import type { EntityRegistry, QueryRegistry } from "@dikta/core";
import type { AgentProtocolConfig } from "@dikta/agent-protocol";
import type { DatabaseTarget } from "./types.js";
import type { OpenAPIConfig } from "./openapi/index.js";

export interface DiktaConfig {
  readonly schema: EntityRegistry;
  readonly queries: QueryRegistry;
  readonly output?: string;
  readonly target?: DatabaseTarget;
  readonly agentProtocol?: AgentProtocolConfig;
  readonly openapi?: OpenAPIConfig;
}

const CONFIG_FILE_NAMES = [
  "dikta.config.ts",
  "dikta.config.js",
  "dikta.config.mts",
  "dikta.config.mjs",
] as const;

export async function loadConfig(configPath?: string): Promise<DiktaConfig> {
  if (configPath) {
    return importConfig(configPath);
  }

  // Auto-discover config file in cwd
  for (const name of CONFIG_FILE_NAMES) {
    const fullPath = `${process.cwd()}/${name}`;
    try {
      return await importConfig(fullPath);
    } catch {
      // Try next file
    }
  }

  throw new Error(
    `No dikta config file found. Create one of: ${CONFIG_FILE_NAMES.join(", ")}`,
  );
}

async function importConfig(path: string): Promise<DiktaConfig> {
  const absolutePath = path.startsWith("/") ? path : `${process.cwd()}/${path}`;
  const module = (await import(absolutePath)) as { default?: DiktaConfig; config?: DiktaConfig };

  const config = module.default ?? module.config;
  if (!config) {
    throw new Error(
      `Config file "${path}" must export a default or named "config" export`,
    );
  }

  if (!config.schema) {
    throw new Error('Config is missing required "schema" (EntityRegistry)');
  }

  if (!config.queries) {
    throw new Error('Config is missing required "queries" (QueryRegistry)');
  }

  return config;
}
