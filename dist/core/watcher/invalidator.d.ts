import type { CodeGraph } from "../graph/index.js";
/**
 * Given a file path and new content, determine if the node is stale
 * and mark it (and its dependents) as stale in the graph.
 * Returns true if the node was stale (needs re-index).
 */
export declare function invalidateIfChanged(graph: CodeGraph, nodeId: string, newContent: string): boolean;
export declare function markFileStale(graph: CodeGraph, nodeId: string): void;
//# sourceMappingURL=invalidator.d.ts.map