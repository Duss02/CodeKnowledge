import { CodeGraph, type GraphNode } from "./index.js";

export interface QueryResult {
  node: GraphNode;
  dependencies: GraphNode[];
  dependents: GraphNode[];
}

export interface ImpactResult {
  changed: GraphNode;
  affected: Array<{ node: GraphNode; depth: number; via: string }>;
}

export function queryNode(graph: CodeGraph, pathOrId: string): QueryResult | null {
  // Try exact match first
  let node = graph.getNode(pathOrId);

  // Try partial match
  if (!node) {
    const matches = graph.search(pathOrId).filter((n) => n.type === "file");
    if (matches.length === 1) node = matches[0];
    else if (matches.length > 1) {
      // Prefer closest match
      node = matches.find((n) => n.id === pathOrId || n.name === pathOrId) ?? matches[0];
    }
  }

  if (!node) return null;

  return {
    node,
    dependencies: graph.successors(node.id),
    dependents: graph.predecessors(node.id),
  };
}

export function findUsages(graph: CodeGraph, symbol: string): GraphNode[] {
  const lower = symbol.toLowerCase();
  return graph.nodes().filter((n) => {
    return (
      n.exports?.some((e) => e.toLowerCase() === lower) ||
      n.name?.toLowerCase() === lower ||
      n.id.toLowerCase().includes(lower)
    );
  });
}

export function computeImpact(
  graph: CodeGraph,
  pathOrId: string,
  maxDepth = 3
): ImpactResult | null {
  const node = graph.getNode(pathOrId);
  if (!node) return null;

  const visited = new Set<string>();
  const affected: ImpactResult["affected"] = [];

  function traverse(id: string, depth: number, via: string): void {
    if (depth > maxDepth || visited.has(id)) return;
    visited.add(id);

    const preds = graph.predecessors(id);
    for (const pred of preds) {
      if (pred.id === pathOrId) continue;
      affected.push({ node: pred, depth, via });
      traverse(pred.id, depth + 1, pred.id);
    }
  }

  traverse(pathOrId, 1, pathOrId);

  return { changed: node, affected };
}

export function getEntryPoints(graph: CodeGraph): GraphNode[] {
  return graph.entryPoints();
}

export function getOverview(graph: CodeGraph): {
  totalNodes: number;
  totalEdges: number;
  fileCount: number;
  classCount: number;
  functionCount: number;
  languages: Record<string, number>;
  entryPoints: GraphNode[];
  staleCount: number;
} {
  const nodes = graph.nodes();
  const languages: Record<string, number> = {};

  for (const node of nodes) {
    if (node.language) {
      languages[node.language] = (languages[node.language] ?? 0) + 1;
    }
  }

  return {
    totalNodes: graph.nodeCount(),
    totalEdges: graph.edgeCount(),
    fileCount: nodes.filter((n) => n.type === "file").length,
    classCount: nodes.filter((n) => n.type === "class").length,
    functionCount: nodes.filter((n) => n.type === "function").length,
    languages,
    entryPoints: graph.entryPoints().slice(0, 10),
    staleCount: graph.staleNodes().length,
  };
}
