import type { EntityRegistry } from "@dikta/core";

/**
 * Topologically sort entities so that referenced entities appear before referencing ones.
 * Uses Kahn's algorithm. Independent entities are sorted alphabetically for stable output.
 */
export function topologicalSort(schema: EntityRegistry): readonly string[] {
  const entities = schema.list();
  const relationships = schema.getRelationships();

  // Build adjacency: if A refs B, edge B -> A (B must come before A)
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const entity of entities) {
    inDegree.set(entity.name, 0);
    dependents.set(entity.name, []);
  }

  for (const rel of relationships) {
    // from has a ref to "to", so "to" must be created first
    // Skip self-references
    if (rel.from === rel.to) continue;

    const current = inDegree.get(rel.from) ?? 0;
    inDegree.set(rel.from, current + 1);

    const deps = dependents.get(rel.to) ?? [];
    deps.push(rel.from);
    dependents.set(rel.to, deps);
  }

  // Collect nodes with no dependencies, sorted alphabetically for stability
  const queue: string[] = [];
  for (const [name, degree] of inDegree) {
    if (degree === 0) {
      queue.push(name);
    }
  }
  queue.sort();

  const result: string[] = [];

  while (queue.length > 0) {
    // Always pick alphabetically first for deterministic output
    queue.sort();
    const current = queue.shift()!;
    result.push(current);

    for (const dependent of dependents.get(current) ?? []) {
      const newDegree = (inDegree.get(dependent) ?? 1) - 1;
      inDegree.set(dependent, newDegree);
      if (newDegree === 0) {
        queue.push(dependent);
      }
    }
  }

  if (result.length !== entities.length) {
    const remaining = entities
      .map((e) => e.name)
      .filter((n) => !result.includes(n));
    throw new Error(
      `Circular dependency detected among entities: ${remaining.join(", ")}. ` +
        `Break the cycle by using soft_delete cascade or restructuring references.`,
    );
  }

  return result;
}
