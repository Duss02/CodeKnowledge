import { sha256 } from "../../utils/hash.js";
import type { CodeGraph } from "../graph/index.js";

/**
 * Given a file path and new content, determine if the node is stale
 * and mark it (and its dependents) as stale in the graph.
 * Returns true if the node was stale (needs re-index).
 */
export function invalidateIfChanged(
  graph: CodeGraph,
  nodeId: string,
  newContent: string
): boolean {
  const node = graph.getNode(nodeId);
  if (!node) return true; // new file, needs indexing

  const newHash = sha256(newContent);
  if (node.hash === newHash) return false; // unchanged

  graph.markStale(nodeId);
  return true;
}

export function markFileStale(graph: CodeGraph, nodeId: string): void {
  graph.markStale(nodeId);
}
