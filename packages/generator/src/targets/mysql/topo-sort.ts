// FK dependency ordering is database-agnostic — reuse the PostgreSQL implementation
export { topologicalSort } from "../postgresql/topo-sort.js";
