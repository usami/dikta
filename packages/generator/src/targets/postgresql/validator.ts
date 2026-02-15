import type { EntityRegistry, EntityDefinition } from "@dikta/core";
import type { GeneratedFile } from "../../types.js";
import { fileHeader, toSnakeCase, toPascalCase } from "../../file.js";

// ── Invariant pattern matching ──────────────────────────────

interface ComparisonInvariant {
  readonly type: "comparison";
  readonly field: string;
  readonly operator: string;
  readonly value: string;
  readonly original: string;
}

interface TransitionInvariant {
  readonly type: "transition";
  readonly field: string;
  readonly states: readonly string[];
  readonly original: string;
}

interface UnrecognizedInvariant {
  readonly type: "unrecognized";
  readonly original: string;
}

type ParsedInvariant =
  | ComparisonInvariant
  | TransitionInvariant
  | UnrecognizedInvariant;

const COMPARISON_PATTERN = /^(\w+)\s*(>=|<=|>|<|===|!==|==|!=)\s*(.+)$/;
const TRANSITION_PATTERN = /^(\w+)\s+transitions?:\s*(.+)$/i;

function parseInvariant(invariant: string): ParsedInvariant {
  const compMatch = COMPARISON_PATTERN.exec(invariant.trim());
  if (compMatch) {
    return {
      type: "comparison",
      field: compMatch[1]!,
      operator: compMatch[2]!,
      value: compMatch[3]!.trim(),
      original: invariant,
    };
  }

  const transMatch = TRANSITION_PATTERN.exec(invariant.trim());
  if (transMatch) {
    const states = transMatch[2]!
      .split("->")
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      type: "transition",
      field: transMatch[1]!,
      states,
      original: invariant,
    };
  }

  return { type: "unrecognized", original: invariant };
}

// ── Code generation ─────────────────────────────────────────

function generateComparisonCheck(inv: ComparisonInvariant): string {
  // Normalize operator for JS
  const jsOp = inv.operator === "===" ? "===" :
    inv.operator === "!==" ? "!==" :
    inv.operator === "==" ? "===" :
    inv.operator === "!=" ? "!==" :
    inv.operator;

  return [
    `  // Invariant: ${inv.original}`,
    `  if (!(entity.${inv.field} ${jsOp} ${inv.value})) {`,
    `    errors.push(\`Invariant violation: expected ${inv.field} ${inv.operator} ${inv.value}, got \${entity.${inv.field}}\`);`,
    "  }",
  ].join("\n");
}

function generateTransitionCheck(inv: TransitionInvariant): string {
  const mapEntries = inv.states
    .slice(0, -1)
    .map((state, i) => `    "${state}": ["${inv.states[i + 1]}"]`)
    .join(",\n");

  return [
    `  // Invariant: ${inv.original}`,
    `  if (previousEntity) {`,
    `    const transitions: Record<string, string[]> = {`,
    mapEntries + ",",
    `    };`,
    `    const allowed = transitions[previousEntity.${inv.field}];`,
    `    if (allowed && !allowed.includes(entity.${inv.field} as string)) {`,
    `      errors.push(`,
    `        \`Invalid ${inv.field} transition: \${previousEntity.${inv.field}} -> \${entity.${inv.field}}. ` +
    `Allowed: \${allowed.join(", ")}\`,`,
    `      );`,
    "    }",
    "  }",
  ].join("\n");
}

function generateUnrecognizedCheck(inv: UnrecognizedInvariant): string {
  return [
    `  // TODO: Implement invariant check — ${inv.original}`,
    `  // This invariant was not recognized by the generator.`,
    `  // Add manual validation logic here.`,
  ].join("\n");
}

function generateEntityValidator(entity: EntityDefinition): string | null {
  if (entity.invariants.length === 0) return null;

  const parsed = entity.invariants.map(parseInvariant);
  const entityName = toPascalCase(entity.name);
  const hasTransitions = parsed.some((p) => p.type === "transition");

  const lines: string[] = [
    fileHeader(),
    "",
  ];

  // Validator function
  lines.push(
    `export interface ${entityName}Entity {`,
    `  readonly [key: string]: unknown;`,
    "}",
    "",
  );

  if (hasTransitions) {
    lines.push(
      `export function validate${entityName}(`,
      `  entity: ${entityName}Entity,`,
      `  previousEntity?: ${entityName}Entity,`,
      `): readonly string[] {`,
    );
  } else {
    lines.push(
      `export function validate${entityName}(`,
      `  entity: ${entityName}Entity,`,
      `): readonly string[] {`,
    );
  }

  lines.push("  const errors: string[] = [];", "");

  for (const inv of parsed) {
    switch (inv.type) {
      case "comparison":
        lines.push(generateComparisonCheck(inv));
        break;
      case "transition":
        lines.push(generateTransitionCheck(inv));
        break;
      case "unrecognized":
        lines.push(generateUnrecognizedCheck(inv));
        break;
    }
    lines.push("");
  }

  lines.push("  return errors;", "}", "");

  return lines.join("\n");
}

export function generateValidators(
  schema: EntityRegistry,
): readonly GeneratedFile[] {
  const files: GeneratedFile[] = [];

  for (const entity of schema.list()) {
    const content = generateEntityValidator(entity);
    if (!content) continue;

    const fileName = toSnakeCase(entity.name);
    files.push({
      path: `validators/${fileName}.validator.ts`,
      content,
      purpose: `Invariant validators for ${entity.name}`,
      regeneratable: true,
    });
  }

  return files;
}
