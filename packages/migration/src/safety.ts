import type { SchemaChange, SafetyEvaluation, SafetyLevel, ChangeRisk } from "./types.js";

export function evaluateSafety(changes: readonly SchemaChange[]): SafetyEvaluation {
  const risks: ChangeRisk[] = changes.map(evaluateChangeRisk);

  const hasDataLoss = risks.some((r) => r.dataLoss);
  const hasOffline = risks.some((r) => !r.online);

  let level: SafetyLevel;
  if (hasDataLoss) {
    level = "dangerous";
  } else if (hasOffline) {
    level = "caution";
  } else {
    level = "safe";
  }

  const summary = buildSummary(level, risks);

  return Object.freeze({ level, risks: Object.freeze(risks), summary });
}

function evaluateChangeRisk(change: SchemaChange): ChangeRisk {
  switch (change.kind) {
    case "add_entity":
      return risk(change, {
        online: true,
        dataLoss: false,
        reversible: true,
        notes: ["CREATE TABLE is online and reversible"],
      });

    case "remove_entity":
      return risk(change, {
        online: true,
        dataLoss: true,
        reversible: false,
        notes: ["DROP TABLE causes permanent data loss"],
      });

    case "rename_entity":
      return risk(change, {
        online: false,
        dataLoss: false,
        reversible: true,
        notes: ["ALTER TABLE RENAME acquires brief ACCESS EXCLUSIVE lock"],
      });

    case "add_field":
      return evaluateAddField(change);

    case "remove_field":
      return risk(change, {
        online: true,
        dataLoss: true,
        reversible: false,
        notes: ["DROP COLUMN causes permanent data loss for that column"],
      });

    case "rename_field":
      return risk(change, {
        online: false,
        dataLoss: false,
        reversible: true,
        notes: ["ALTER TABLE RENAME COLUMN acquires brief ACCESS EXCLUSIVE lock"],
      });

    case "alter_field":
      return evaluateAlterField(change);

    case "add_invariant":
      return risk(change, {
        online: true,
        dataLoss: false,
        reversible: true,
        notes: ["Application-level constraint, no schema lock required"],
      });

    case "remove_invariant":
      return risk(change, {
        online: true,
        dataLoss: false,
        reversible: true,
        notes: ["Application-level constraint removal"],
      });
  }
}

function evaluateAddField(change: SchemaChange & { kind: "add_field" }): ChangeRisk {
  const isNullable = change.spec.nullable !== false && change.spec.nullable !== undefined
    ? true
    : change.spec.nullable === undefined ? false : change.spec.nullable;
  const hasBackfill = change.backfill !== undefined;

  // nullable field → always online, metadata-only
  if (isNullable) {
    return risk(change, {
      online: true,
      dataLoss: false,
      reversible: true,
      notes: ["ADD COLUMN with NULL is a metadata-only operation"],
    });
  }

  // NOT NULL without backfill → requires DEFAULT or will fail on non-empty table
  if (!hasBackfill) {
    return risk(change, {
      online: false,
      dataLoss: false,
      reversible: true,
      notes: [
        "ADD COLUMN NOT NULL without DEFAULT requires table rewrite",
        "Consider adding a backfill expression or making the field nullable first",
      ],
    });
  }

  // NOT NULL with backfill → three-step: add nullable, update, set not null
  return risk(change, {
    online: false,
    dataLoss: false,
    reversible: true,
    notes: [
      "Three-step migration: ADD COLUMN nullable, UPDATE with backfill, SET NOT NULL",
      "UPDATE step scans entire table",
    ],
  });
}

function evaluateAlterField(change: SchemaChange & { kind: "alter_field" }): ChangeRisk {
  const notes: string[] = [];
  let online = true;
  let dataLoss = false;
  let reversible = true;

  const { changes: alterations } = change;

  if (alterations.kind) {
    online = false;
    notes.push(`Type change from ${alterations.kind.from} to ${alterations.kind.to} may require data conversion`);
  }

  if (alterations.nullable) {
    if (alterations.nullable.from === true && alterations.nullable.to === false) {
      // nullable -> NOT NULL: requires full table scan to validate
      online = false;
      notes.push("SET NOT NULL requires full table scan to validate no NULLs exist");
    } else {
      // NOT NULL -> nullable: metadata-only
      notes.push("DROP NOT NULL is a metadata-only operation");
    }
  }

  if (alterations.values) {
    if (alterations.values.removed.length > 0) {
      dataLoss = true;
      reversible = false;
      notes.push(
        `Enum values removed: ${alterations.values.removed.join(", ")}. Rows with these values will violate constraints`,
      );
    }
    if (alterations.values.added.length > 0) {
      notes.push(`Enum values added: ${alterations.values.added.join(", ")}`);
    }
  }

  if (alterations.entity) {
    online = false;
    notes.push(
      `Foreign key target changed from ${alterations.entity.from} to ${alterations.entity.to}`,
    );
  }

  if (alterations.cascade) {
    notes.push(
      `Cascade rule changed from ${alterations.cascade.from} to ${alterations.cascade.to}`,
    );
  }

  if (alterations.role) {
    notes.push(`Role changed from ${alterations.role.from} to ${alterations.role.to}`);
  }

  if (alterations.description) {
    notes.push("Description changed (metadata only)");
  }

  if (alterations.policy) {
    notes.push("Policy changed (metadata only)");
  }

  if (notes.length === 0) {
    notes.push("No significant schema changes detected");
  }

  return risk(change, { online, dataLoss, reversible, notes });
}

function risk(
  change: SchemaChange,
  opts: { online: boolean; dataLoss: boolean; reversible: boolean; notes: string[] },
): ChangeRisk {
  return Object.freeze({
    change,
    online: opts.online,
    dataLoss: opts.dataLoss,
    reversible: opts.reversible,
    notes: Object.freeze(opts.notes),
  });
}

function buildSummary(level: SafetyLevel, risks: readonly ChangeRisk[]): string {
  const total = risks.length;
  const dataLossCount = risks.filter((r) => r.dataLoss).length;
  const offlineCount = risks.filter((r) => !r.online).length;
  const irreversibleCount = risks.filter((r) => !r.reversible).length;

  const parts: string[] = [`${total} change(s)`];

  if (dataLossCount > 0) {
    parts.push(`${dataLossCount} with data loss risk`);
  }
  if (offlineCount > 0) {
    parts.push(`${offlineCount} requiring downtime or locks`);
  }
  if (irreversibleCount > 0) {
    parts.push(`${irreversibleCount} irreversible`);
  }

  return `${level.toUpperCase()}: ${parts.join(", ")}`;
}
