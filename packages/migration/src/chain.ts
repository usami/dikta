import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type {
  MigrationExecutor,
  MigrationRecord,
  MigrationEntry,
  MigrationResult,
  MigrationError,
  MigrationChainConfig,
  DiscoveredMigration,
  MigrationStatusSummary,
  MigrationMetadata,
  MigrateUpOptions,
  MigrateDownOptions,
} from "./types.js";
import { createChainDialect } from "./chain-dialect.js";

// ── Constants ───────────────────────────────────────────────

const DEFAULT_TABLE_NAME = "dikta_migrations";

/**
 * Matches migration directory names: 14 digits + underscore + name.
 * E.g. "20260115000000_add_users"
 */
const MIGRATION_DIR_PATTERN = /^(\d{14})_(.+)$/;

// ── Checksum ────────────────────────────────────────────────

/** Compute SHA-256 checksum of content. */
export function computeChecksum(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

// ── Discovery ───────────────────────────────────────────────

/**
 * Discover migrations from the filesystem.
 * Reads directories matching `{14digits}_{name}/` pattern,
 * parses metadata.json, reads up.sql/down.sql/verify.sql.
 * Returns migrations sorted by version ASC.
 */
export function discoverMigrations(migrationsDir: string): readonly DiscoveredMigration[] {
  if (!existsSync(migrationsDir)) {
    return [];
  }

  const entries = readdirSync(migrationsDir, { withFileTypes: true });
  const migrations: DiscoveredMigration[] = [];
  const seenVersions = new Map<string, string>();

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const match = MIGRATION_DIR_PATTERN.exec(entry.name);
    if (!match) continue;

    const version = match[1]!;
    const name = match[2]!;
    const dirPath = join(migrationsDir, entry.name);

    // Detect duplicate versions
    if (seenVersions.has(version)) {
      throw new Error(
        `Duplicate migration version "${version}" found in "${seenVersions.get(version)}" and "${entry.name}"`,
      );
    }
    seenVersions.set(version, entry.name);

    const metadataPath = join(dirPath, "metadata.json");
    const upPath = join(dirPath, "up.sql");
    const downPath = join(dirPath, "down.sql");
    const verifyPath = join(dirPath, "verify.sql");

    if (!existsSync(upPath)) {
      throw new Error(`Migration "${entry.name}" is missing up.sql`);
    }

    const metadata: MigrationMetadata = existsSync(metadataPath)
      ? (JSON.parse(readFileSync(metadataPath, "utf-8")) as MigrationMetadata)
      : { name, description: "", timestamp: version, changes: [], safety: { level: "safe", risks: [], summary: "" }, impact: { contracts: [], indexRecommendations: [], backfillRequirements: [] } };

    const upSQL = readFileSync(upPath, "utf-8");
    const downSQL = existsSync(downPath) ? readFileSync(downPath, "utf-8") : "";
    const verifySQL = existsSync(verifyPath) ? readFileSync(verifyPath, "utf-8") : "";

    migrations.push({ version, name, dirPath, metadata, upSQL, downSQL, verifySQL });
  }

  // Sort by version ASC
  migrations.sort((a, b) => a.version.localeCompare(b.version));

  return migrations;
}

// ── Status resolution ───────────────────────────────────────

/**
 * Ensure the tracking table exists, then merge discovered migrations
 * with applied records to produce MigrationEntry[].
 */
export async function resolveMigrationStatus(
  discovered: readonly DiscoveredMigration[],
  executor: MigrationExecutor,
  config: MigrationChainConfig,
): Promise<readonly MigrationEntry[]> {
  const dialect = createChainDialect(config.target);
  const tableName = config.tableName ?? DEFAULT_TABLE_NAME;

  // Ensure tracking table exists
  await executor.execute(dialect.createTrackingTable(tableName));

  // Query applied records
  const applied = await executor.query<MigrationRecord>(dialect.selectApplied(tableName));
  const appliedMap = new Map(applied.map((r) => [r.version, r]));

  return discovered.map((m): MigrationEntry => {
    const record = appliedMap.get(m.version);
    const checksum = computeChecksum(m.upSQL);

    if (record) {
      return {
        version: m.version,
        name: m.name,
        dirPath: m.dirPath,
        status: "applied",
        appliedAt: record.applied_at,
        checksum,
        checksumMismatch: record.checksum !== checksum,
      };
    }

    return {
      version: m.version,
      name: m.name,
      dirPath: m.dirPath,
      status: "pending",
      checksum,
    };
  });
}

// ── Migrate up ──────────────────────────────────────────────

/**
 * Apply pending migrations in version order.
 * Stops on first error. Returns result with applied/skipped/errors.
 */
export async function migrateUp(
  executor: MigrationExecutor,
  config: MigrationChainConfig,
  options?: MigrateUpOptions,
): Promise<MigrationResult> {
  const discovered = discoverMigrations(config.migrationsDir);
  const entries = await resolveMigrationStatus(discovered, executor, config);
  const dialect = createChainDialect(config.target);
  const tableName = config.tableName ?? DEFAULT_TABLE_NAME;

  const pending = entries.filter((e) => e.status === "pending");
  const skipped = entries.filter((e) => e.status === "applied");

  // Apply target/count filters
  let toApply = [...pending];
  if (options?.target) {
    const targetIdx = toApply.findIndex((e) => e.version === options.target);
    if (targetIdx === -1) {
      return {
        applied: [],
        skipped: skipped.map(({ version, name }) => ({ version, name })),
        errors: [{ version: options.target, name: "unknown", message: `Target version "${options.target}" not found or not pending` }],
      };
    }
    toApply = toApply.slice(0, targetIdx + 1);
  }
  if (options?.count !== undefined) {
    toApply = toApply.slice(0, options.count);
  }

  const applied: { version: string; name: string }[] = [];
  const errors: MigrationError[] = [];

  // Find the discovered migration for SQL content
  const discoveredMap = new Map(discovered.map((d) => [d.version, d]));

  for (const entry of toApply) {
    const migration = discoveredMap.get(entry.version)!;
    try {
      await executor.execute(migration.upSQL);
      await executor.execute(dialect.insertRecord(tableName, entry.version, entry.name, entry.checksum));
      applied.push({ version: entry.version, name: entry.name });
    } catch (err) {
      errors.push({
        version: entry.version,
        name: entry.name,
        message: err instanceof Error ? err.message : String(err),
      });
      break; // Stop on first error
    }
  }

  return {
    applied,
    skipped: skipped.map(({ version, name }) => ({ version, name })),
    errors,
  };
}

// ── Migrate down ────────────────────────────────────────────

/**
 * Roll back applied migrations in reverse version order.
 * Default count is 1. Stops on first error.
 */
export async function migrateDown(
  executor: MigrationExecutor,
  config: MigrationChainConfig,
  options?: MigrateDownOptions,
): Promise<MigrationResult> {
  const discovered = discoverMigrations(config.migrationsDir);
  const entries = await resolveMigrationStatus(discovered, executor, config);
  const dialect = createChainDialect(config.target);
  const tableName = config.tableName ?? DEFAULT_TABLE_NAME;

  const appliedEntries = entries.filter((e) => e.status === "applied");
  const pendingEntries = entries.filter((e) => e.status === "pending");

  // Reverse order for rollback
  let toRollback = [...appliedEntries].reverse();

  if (options?.target) {
    // Roll back down to target (target version stays applied)
    const targetIdx = toRollback.findIndex((e) => e.version === options.target);
    if (targetIdx === -1) {
      return {
        applied: [],
        skipped: pendingEntries.map(({ version, name }) => ({ version, name })),
        errors: [{ version: options.target, name: "unknown", message: `Target version "${options.target}" not found or not applied` }],
      };
    }
    // Roll back everything before the target (target stays)
    toRollback = toRollback.slice(0, targetIdx);
  } else {
    // Default: roll back 1
    const count = options?.count ?? 1;
    toRollback = toRollback.slice(0, count);
  }

  const applied: { version: string; name: string }[] = [];
  const errors: MigrationError[] = [];

  const discoveredMap = new Map(discovered.map((d) => [d.version, d]));

  for (const entry of toRollback) {
    const migration = discoveredMap.get(entry.version)!;
    if (!migration.downSQL) {
      errors.push({
        version: entry.version,
        name: entry.name,
        message: "Missing down.sql — cannot roll back",
      });
      break;
    }
    try {
      await executor.execute(migration.downSQL);
      await executor.execute(dialect.deleteRecord(tableName, entry.version));
      applied.push({ version: entry.version, name: entry.name });
    } catch (err) {
      errors.push({
        version: entry.version,
        name: entry.name,
        message: err instanceof Error ? err.message : String(err),
      });
      break;
    }
  }

  return {
    applied,
    skipped: pendingEntries.map(({ version, name }) => ({ version, name })),
    errors,
  };
}

// ── Migration status ────────────────────────────────────────

/** Get a summary of all migration statuses. */
export async function getMigrationStatus(
  executor: MigrationExecutor,
  config: MigrationChainConfig,
): Promise<MigrationStatusSummary> {
  const discovered = discoverMigrations(config.migrationsDir);
  const entries = await resolveMigrationStatus(discovered, executor, config);

  const appliedCount = entries.filter((e) => e.status === "applied").length;

  return {
    total: entries.length,
    applied: appliedCount,
    pending: entries.length - appliedCount,
    entries,
  };
}
