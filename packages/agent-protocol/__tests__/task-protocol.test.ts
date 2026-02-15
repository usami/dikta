import { describe, it, expect } from "vitest";
import {
  createTask,
  implementQueryTask,
  addEntityTask,
  modifySchemaTask,
  fixContractViolationTask,
} from "../src/task-protocol.js";

describe("createTask", () => {
  it("should return a frozen object", () => {
    const task = createTask({
      kind: "implement_query",
      description: "Implement findUserById",
    });

    expect(Object.isFrozen(task)).toBe(true);
    expect(Object.isFrozen(task.context)).toBe(true);
  });

  it("should always include agent-context.json in read_first", () => {
    const task = createTask({
      kind: "add_entity",
      description: "Add User entity",
    });

    expect(task.context.read_first).toContain(".dikta/agent-context.json");
  });

  it("should not duplicate agent-context.json in read_first", () => {
    const task = createTask({
      kind: "add_entity",
      description: "Add User entity",
      read_first: [".dikta/agent-context.json", "schema.ts"],
    });

    const occurrences = task.context.read_first.filter(
      (p) => p === ".dikta/agent-context.json",
    );
    expect(occurrences).toHaveLength(1);
    expect(task.context.read_first).toContain("schema.ts");
  });

  it("should include entity and contract when provided", () => {
    const task = createTask({
      kind: "implement_query",
      description: "Implement query",
      entity: "Order",
      contract: "findOrders",
    });

    expect(task.context.entity).toBe("Order");
    expect(task.context.contract).toBe("findOrders");
  });

  it("should omit entity and contract when not provided", () => {
    const task = createTask({
      kind: "add_entity",
      description: "Add entity",
    });

    expect(task.context).not.toHaveProperty("entity");
    expect(task.context).not.toHaveProperty("contract");
  });

  it("should default constraints and verification to empty arrays", () => {
    const task = createTask({
      kind: "add_entity",
      description: "Add entity",
    });

    expect(task.constraints).toEqual([]);
    expect(task.verification).toEqual([]);
  });
});

describe("implementQueryTask", () => {
  it("should create a task with kind implement_query", () => {
    const task = implementQueryTask("findOrders", "Order");

    expect(task.kind).toBe("implement_query");
    expect(task.context.entity).toBe("Order");
    expect(task.context.contract).toBe("findOrders");
    expect(task.context.description).toContain("findOrders");
    expect(task.context.description).toContain("Order");
  });

  it("should include relevant constraints", () => {
    const task = implementQueryTask("findOrders", "Order");

    expect(task.constraints.length).toBeGreaterThan(0);
    expect(task.constraints.some((c) => c.includes("params"))).toBe(true);
    expect(task.constraints.some((c) => c.includes("performance"))).toBe(true);
  });

  it("should include verification commands", () => {
    const task = implementQueryTask("findOrders", "Order");

    expect(task.verification).toContain("npx dikta verify");
    expect(task.verification).toContain("pnpm typecheck");
    expect(task.verification).toContain("pnpm test");
  });
});

describe("addEntityTask", () => {
  it("should create a task with kind add_entity", () => {
    const task = addEntityTask("Product");

    expect(task.kind).toBe("add_entity");
    expect(task.context.entity).toBe("Product");
    expect(task.context.description).toContain("Product");
  });
});

describe("modifySchemaTask", () => {
  it("should create a task with kind modify_schema", () => {
    const task = modifySchemaTask("User", "Add email field to User");

    expect(task.kind).toBe("modify_schema");
    expect(task.context.entity).toBe("User");
    expect(task.context.description).toBe("Add email field to User");
  });
});

describe("fixContractViolationTask", () => {
  it("should create a task with kind fix_contract_violation", () => {
    const task = fixContractViolationTask(
      "findOrders",
      "max_rows",
      "Add LIMIT 100 to the query",
    );

    expect(task.kind).toBe("fix_contract_violation");
    expect(task.context.contract).toBe("findOrders");
    expect(task.context.description).toContain("max_rows");
    expect(task.context.description).toContain("Add LIMIT 100");
  });

  it("should include the suggestion in constraints", () => {
    const task = fixContractViolationTask(
      "findOrders",
      "row_filter",
      "Add WHERE tenant_id = $1",
    );

    expect(task.constraints).toContain("Add WHERE tenant_id = $1");
  });
});
