import { createHash } from "node:crypto";
import type { EntityRegistry, QueryRegistry } from "@dikta/core";
import type { GeneratedFile } from "./types.js";

export interface ManifestEntry {
  readonly path: string;
  readonly purpose: string;
  readonly regeneratable: boolean;
  readonly content_hash: string;
}

export interface Manifest {
  readonly version: 1;
  readonly generated_at: string;
  readonly schema_hash: string;
  readonly query_hash: string;
  readonly files: readonly ManifestEntry[];
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function computeQueryHash(queries: QueryRegistry): string {
  const contracts = queries.list().map((q) => ({
    name: q.name,
    config: q.config,
  }));
  // Sort by name for deterministic hashing
  contracts.sort((a, b) => a.name.localeCompare(b.name));
  return sha256(JSON.stringify(contracts));
}

export function generateManifest(
  schema: EntityRegistry,
  queries: QueryRegistry,
  generatedFiles: readonly GeneratedFile[],
): GeneratedFile {
  const manifest: Manifest = {
    version: 1,
    generated_at: new Date().toISOString(),
    schema_hash: sha256(schema.serialize()),
    query_hash: computeQueryHash(queries),
    files: generatedFiles.map((f) => ({
      path: f.path,
      purpose: f.purpose,
      regeneratable: f.regeneratable,
      content_hash: sha256(f.content),
    })),
  };

  return {
    path: "manifest.json",
    content: JSON.stringify(manifest, null, 2) + "\n",
    purpose: "Generation manifest with schema/query hashes and file inventory",
    regeneratable: true,
  };
}

export { sha256 };
