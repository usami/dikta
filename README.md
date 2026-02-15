# Dikta

**Declarative intent schemas and query contracts for the AI agent era.**

Dikta replaces traditional ORMs with a contract-driven approach: you declare *what* your data means and *how* it should behave, and AI agents (or humans) generate the implementation. No runtime query builder. No fluent API. Just explicit, verifiable contracts.

> From Latin *dictare* — to dictate, to declare.

## Why not an ORM?

ORMs were designed to save humans from writing repetitive SQL. When AI agents write the code, that productivity layer becomes overhead. What agents actually need is:

- **Semantic metadata** — "this field is PII", "this is a monetary amount"
- **Performance contracts** — "this query must use an index scan", "max 100 rows"
- **Security constraints** — "requires tenant isolation"
- **Verification** — automated checks that generated code satisfies the contracts

Dikta provides all of this. Prisma, Drizzle, and sqlc each moved in the right direction but stopped at structure. Dikta captures **intent**.

## Quick Example

### Define an Entity

```typescript
import {
  defineEntity,
  uuid, string, decimal, integer, boolean, timestamp,
  enumField, ref,
} from "@dikta/core";

const Order = defineEntity({
  name: "Order",
  fields: {
    id:            uuid({ role: "identifier" }),
    customer_name: string({ role: "display_name" }),
    total:         decimal({ role: "monetary" }),
    quantity:      integer({ role: "quantity" }),
    is_paid:       boolean(),
    created_at:    timestamp({ role: "audit_timestamp" }),
    status:        enumField(["pending", "shipped", "delivered"]),
    customer_id:   ref("Customer", { cascade: "restrict" }),
  },
  invariants: [
    { description: "total must be non-negative", check: "total >= 0" },
  ],
});

// Full type inference — no codegen step needed
type OrderRow = typeof Order.infer;
// → {
//     readonly id: string;
//     readonly customer_name: string;
//     readonly total: number;
//     readonly quantity: number;
//     readonly is_paid: boolean;
//     readonly created_at: Date;
//     readonly status: "pending" | "shipped" | "delivered";
//     readonly customer_id: string;
//   }
```

### Define a Query Contract

```typescript
import { defineQuery } from "@dikta/core";

const getActiveOrders = defineQuery("getActiveOrders", {
  purpose: "Dashboard order list filtered by customer",
  from: "Order",
  params: {
    customer_id: { type: "uuid", required: true },
    status:      { type: "string" },
    limit:       { type: "int", default: 50 },
  },
  returns: {
    shape: {
      id:            "uuid",
      total:         "decimal",
      status:        "string",
      customer_name: { from: "Customer.name" },
    },
    ordering: [{ field: "created_at", direction: "desc" }],
    pagination: "cursor",
  },
  performance: {
    max_rows: 100,
    scan_strategy: "index_only",
  },
  security: {
    requires: ["tenant_isolation"],
  },
});

// Params and result types are inferred from the contract
type Params = typeof getActiveOrders.inferParams;
// → { customer_id: string; status?: string; limit?: number }

type Result = typeof getActiveOrders.inferResult;
// → { id: string; total: number; status: string; customer_name: string }
```

### Verify Generated SQL

```typescript
import { verifyMaxRows, verifyRowFilter, verifyScanStrategy } from "@dikta/core";

const sql = `SELECT ... FROM orders WHERE customer_id = $1 LIMIT 100`;

verifyMaxRows(sql, 100);                    // checks LIMIT clause
verifyRowFilter(sql, "customer_id");         // checks WHERE clause
verifyScanStrategy(sql, "index_only");       // checks for sequential scans
```

### Generate Code

```bash
# Generate all: DDL, access layer, validators, contract tests
npx dikta generate

# Generate selectively
npx dikta generate --ddl
npx dikta generate --access
npx dikta generate --validators
npx dikta generate --tests

# Custom output directory
npx dikta generate --output ./src/generated

# Verify contracts without generating
npx dikta verify
```

Or use the programmatic API:

```typescript
import { generateAll, createPostgreSQLGenerator } from "@dikta/generator";

const files = generateAll(schema, queries);
// files: GeneratedFile[] with path, content, purpose, regeneratable
```

## Key Design Decisions

| Principle | What it means |
|---|---|
| **Intent over Abstraction** | Annotates data with meaning (roles, policies, invariants) instead of hiding SQL behind method chains |
| **Contract over Convention** | Explicit, machine-readable specs instead of naming conventions that agents can't reliably follow |
| **Generated over Maintained** | Access layer is disposable `.generated/` output — no runtime dependency to version |
| **Verification over Trust** | Contracts serve as automated test specs for any generated implementation |

## Architecture

```
You maintain:                        Agents generate:
+--------------------------+         +--------------------------+
| Intent Schema            |         | DDL (CREATE TABLE, INDEX)|
|   entities, fields,      |  --->   | Typed access functions   |
|   roles, policies        |         | Validators               |
|                          |         | Contract verification    |
| Query Contracts          |         | Migration SQL            |
|   params, return shape,  |         +--------------------------+
|   performance, security  |                    |
+--------------------------+                    v
                                     +--------------------------+
                                     | Verification Layer       |
                                     |   Type checking (tsc)    |
                                     |   EXPLAIN analysis       |
                                     |   Invariant tests        |
                                     |   Policy compliance      |
                                     +--------------------------+
```

Humans manage intent. Machines manage implementation.

## Install

```bash
pnpm add @dikta/core
pnpm add -D @dikta/generator
pnpm add -D @dikta/migration
```

## Status

Dikta is in early development. The current implementation covers:

| Phase | Scope | Status |
|---|---|---|
| 1 | Intent Schema engine (`defineEntity`, field builders, type inference, serialization) | Done |
| 2 | Query Contract system (`defineQuery`, schema validation, SQL verification) | Done |
| 3 | Code generation (CLI, DDL, access functions, validators) | Done |
| 4 | Migration planner (schema diff, safe migration SQL) | Done |
| 5 | Agent protocol (agent-context.json, violation reporter) | Planned |

## Development

```bash
git clone https://github.com/user/dikta.git
cd dikta
pnpm install
pnpm build      # tsup -> dist/
pnpm test       # vitest
pnpm typecheck  # tsc --noEmit
```

## License

MIT
