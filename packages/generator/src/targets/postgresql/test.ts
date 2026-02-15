import type { QueryRegistry } from "@dikta/core";
import type { GeneratedFile } from "../../types.js";
import { fileHeader, toSnakeCase } from "../../file.js";

export function generateContractTests(
  queries: QueryRegistry,
): readonly GeneratedFile[] {
  const contracts = queries.list();
  if (contracts.length === 0) return [];

  const lines: string[] = [
    fileHeader(),
    "",
    'import { describe, it, expect } from "vitest";',
    'import { verifyMaxRows, verifyRowFilter } from "@dikta/core";',
    "",
  ];

  // Import SQL constants from access layer
  for (const contract of contracts) {
    const fileName = toSnakeCase(contract.name);
    const sqlConst = `SQL_${toSnakeCase(contract.name).toUpperCase()}`;
    lines.push(
      `import { ${sqlConst} } from "../access/${fileName}.js";`,
    );
  }

  lines.push("");

  // Import the contracts themselves — they need to be available at test time.
  // We'll generate inline contract objects from the config.
  for (const contract of contracts) {
    const { name, config } = contract;
    const varName = `${toSnakeCase(name)}_contract`;
    lines.push(`const ${varName} = {`);
    lines.push(`  name: ${JSON.stringify(name)},`);
    lines.push(`  config: ${JSON.stringify(config, null, 4).split("\n").map((l, i) => i === 0 ? l : "  " + l).join("\n")},`);
    lines.push("} as const;");
    lines.push("");
  }

  // Describe blocks
  for (const contract of contracts) {
    const { name, config } = contract;
    const sqlConst = `SQL_${toSnakeCase(name).toUpperCase()}`;
    const varName = `${toSnakeCase(name)}_contract`;

    lines.push(`describe("${name}", () => {`);

    // max_rows test
    if (config.performance?.max_rows !== undefined) {
      lines.push(`  it("should enforce max_rows=${config.performance.max_rows} via LIMIT", () => {`);
      lines.push(`    const result = verifyMaxRows(${sqlConst}, ${varName} as never);`);
      lines.push("    expect(result.passed).toBe(true);");
      lines.push("  });");
      lines.push("");
    }

    // row_filter test
    if (config.security?.row_filter) {
      lines.push(`  it("should enforce row_filter on '${config.security.row_filter}'", () => {`);
      lines.push(`    const result = verifyRowFilter(${sqlConst}, ${varName} as never);`);
      lines.push("    expect(result.passed).toBe(true);");
      lines.push("  });");
      lines.push("");
    }

    // SQL structure assertion
    lines.push(`  it("should produce valid SQL", () => {`);
    lines.push(`    expect(${sqlConst}).toContain("SELECT");`);
    lines.push(`    expect(${sqlConst}).toContain("FROM");`);
    lines.push("  });");

    lines.push("});");
    lines.push("");
  }

  return [
    {
      path: "tests/contracts.test.ts",
      content: lines.join("\n"),
      purpose: "Contract verification tests for all query contracts",
      regeneratable: true,
    },
  ];
}
