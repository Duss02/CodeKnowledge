import { CodeGraph, type GraphNode } from "./index.js";
import type { ParsedNode, ParsedEdge } from "../parser/types.js";

export function buildGraph(
  allNodes: ParsedNode[],
  allEdges: ParsedEdge[],
  existingGraph?: CodeGraph
): CodeGraph {
  const graph = existingGraph ?? new CodeGraph();
  const now = new Date().toISOString();

  for (const node of allNodes) {
    const existing = graph.getNode(node.id);
    const graphNode: GraphNode = {
      ...node,
      stale: false,
      last_indexed: now,
      summary: existing?.summary,
      tags: existing?.tags,
    };
    graph.addNode(graphNode);
  }

  for (const edge of allEdges) {
    graph.addEdge(edge);
  }

  return graph;
}

export function mergeIntoGraph(
  graph: CodeGraph,
  newNodes: ParsedNode[],
  newEdges: ParsedEdge[]
): void {
  const now = new Date().toISOString();

  for (const node of newNodes) {
    const existing = graph.getNode(node.id);
    const needsSummaryUpdate = !existing || existing.hash !== node.hash;

    const graphNode: GraphNode = {
      ...node,
      stale: needsSummaryUpdate,
      last_indexed: now,
      summary: needsSummaryUpdate ? undefined : existing?.summary,
      tags: needsSummaryUpdate ? undefined : existing?.tags,
    };
    graph.addNode(graphNode);
  }

  for (const edge of newEdges) {
    graph.addEdge(edge);
  }
}
