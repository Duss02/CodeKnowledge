import DirectedGraph from "graphology";
import type { ParsedNode, ParsedEdge } from "../parser/types.js";

export interface GraphNode extends ParsedNode {
  summary?: string;
  tags?: string[];
  stale: boolean;
  last_indexed: string;
}

export interface GraphEdge extends ParsedEdge { }

export class CodeGraph {
  private graph: DirectedGraph;

  constructor() {
    this.graph = new DirectedGraph({ allowSelfLoops: false, multi: false });
  }

  addNode(node: GraphNode): void {
    if (this.graph.hasNode(node.id)) {
      this.graph.replaceNodeAttributes(node.id, node);
    } else {
      this.graph.addNode(node.id, node);
    }
  }

  addEdge(edge: GraphEdge): void {
    if (!this.graph.hasNode(edge.source)) {
      this.graph.addNode(edge.source, { id: edge.source, type: "file", stale: false, last_indexed: new Date().toISOString() });
    }
    if (!this.graph.hasNode(edge.target)) {
      this.graph.addNode(edge.target, { id: edge.target, type: "file", stale: false, last_indexed: new Date().toISOString() });
    }

    const edgeKey = `${edge.source}→${edge.target}:${edge.type}`;
    if (!this.graph.hasEdge(edgeKey)) {
      try {
        this.graph.addDirectedEdgeWithKey(edgeKey, edge.source, edge.target, edge);
      } catch {
        // ignore duplicate edges
      }
    }
  }

  getNode(id: string): GraphNode | undefined {
    if (!this.graph.hasNode(id)) return undefined;
    return this.graph.getNodeAttributes(id) as GraphNode;
  }

  updateNode(id: string, attrs: Partial<GraphNode>): void {
    if (!this.graph.hasNode(id)) return;
    this.graph.mergeNodeAttributes(id, attrs);
  }

  hasNode(id: string): boolean {
    return this.graph.hasNode(id);
  }

  removeNode(id: string): void {
    if (this.graph.hasNode(id)) {
      this.graph.dropNode(id);
    }
  }

  nodes(): GraphNode[] {
    return this.graph.nodes().map((id) => this.graph.getNodeAttributes(id) as GraphNode);
  }

  edges(): GraphEdge[] {
    return this.graph.edges().map((key) => this.graph.getEdgeAttributes(key) as GraphEdge);
  }

  nodeCount(): number {
    return this.graph.order;
  }

  edgeCount(): number {
    return this.graph.size;
  }

  /** Returns direct predecessors (nodes that have edges pointing TO id) */
  predecessors(id: string): GraphNode[] {
    if (!this.graph.hasNode(id)) return [];
    return this.graph.inNeighbors(id).map((n) => this.graph.getNodeAttributes(n) as GraphNode);
  }

  /** Returns direct successors (nodes that id has edges pointing TO) */
  successors(id: string): GraphNode[] {
    if (!this.graph.hasNode(id)) return [];
    return this.graph.outNeighbors(id).map((n) => this.graph.getNodeAttributes(n) as GraphNode);
  }

  /** Find all nodes whose id or name fuzzy-matches the query */
  search(query: string): GraphNode[] {
    const lower = query.toLowerCase();
    return this.nodes().filter((n) => {
      return (
        n.id.toLowerCase().includes(lower) ||
        (n.name && n.name.toLowerCase().includes(lower)) ||
        (n.summary && n.summary.toLowerCase().includes(lower)) ||
        (n.tags && n.tags.some((t) => t.toLowerCase().includes(lower)))
      );
    });
  }

  /** Transitive dependents up to maxDepth hops */
  transitiveSuccessors(id: string, maxDepth = 3): GraphNode[] {
    const visited = new Set<string>();
    const queue: Array<{ id: string; depth: number }> = [{ id, depth: 0 }];
    const result: GraphNode[] = [];

    while (queue.length > 0) {
      const { id: current, depth } = queue.shift()!;
      if (visited.has(current) || depth > maxDepth) continue;
      visited.add(current);

      const node = this.getNode(current);
      if (node && current !== id) result.push(node);

      if (depth < maxDepth) {
        for (const succ of this.graph.outNeighbors(current)) {
          if (!visited.has(succ)) {
            queue.push({ id: succ, depth: depth + 1 });
          }
        }
      }
    }

    return result;
  }

  /** Transitive predecessors (who depends on this?) */
  transitivePredecessors(id: string, maxDepth = 3): GraphNode[] {
    const visited = new Set<string>();
    const queue: Array<{ id: string; depth: number }> = [{ id, depth: 0 }];
    const result: GraphNode[] = [];

    while (queue.length > 0) {
      const { id: current, depth } = queue.shift()!;
      if (visited.has(current) || depth > maxDepth) continue;
      visited.add(current);

      const node = this.getNode(current);
      if (node && current !== id) result.push(node);

      if (depth < maxDepth) {
        for (const pred of this.graph.inNeighbors(current)) {
          if (!visited.has(pred)) {
            queue.push({ id: pred, depth: depth + 1 });
          }
        }
      }
    }

    return result;
  }

  /** Entry points = nodes with no incoming edges */
  entryPoints(): GraphNode[] {
    return this.nodes().filter((n) => this.graph.inDegree(n.id) === 0 && n.type === "file");
  }

  /**
   * Mark a node as stale and propagate staleness to importers up to `depth` hops.
   * Uses BFS to traverse the import graph backwards, avoiding cycles.
   * @param id - Node to mark as stale
   * @param depth - How many hops to propagate (default: 1). Use 0 for no propagation.
   * @returns Set of all node IDs that were marked stale
   */
  markStale(id: string, depth: number = 1): Set<string> {
    const staleSet = new Set<string>();

    if (this.graph.hasNode(id)) {
      this.graph.mergeNodeAttributes(id, { stale: true });
      staleSet.add(id);
    }

    if (depth <= 0) return staleSet;

    // BFS: propagate through incoming edges (importers of this node)
    let frontier = [id];
    for (let hop = 0; hop < depth; hop++) {
      const nextFrontier: string[] = [];
      for (const nodeId of frontier) {
        if (!this.graph.hasNode(nodeId)) continue;
        for (const pred of this.graph.inNeighbors(nodeId)) {
          if (!staleSet.has(pred)) {
            this.graph.mergeNodeAttributes(pred, { stale: true });
            staleSet.add(pred);
            nextFrontier.push(pred);
          }
        }
      }
      frontier = nextFrontier;
      if (frontier.length === 0) break; // no more nodes to propagate to
    }

    return staleSet;
  }

  staleNodes(): GraphNode[] {
    return this.nodes().filter((n) => n.stale);
  }

  /** Returns edges originating from a node (outbound) */
  edgesFrom(id: string): GraphEdge[] {
    if (!this.graph.hasNode(id)) return [];
    return this.graph.outEdges(id).map((key) => this.graph.getEdgeAttributes(key) as GraphEdge);
  }

  /** Returns edges pointing to a node (inbound) */
  edgesTo(id: string): GraphEdge[] {
    if (!this.graph.hasNode(id)) return [];
    return this.graph.inEdges(id).map((key) => this.graph.getEdgeAttributes(key) as GraphEdge);
  }

  /** Compute in-degree centrality for all nodes, normalized to 0-1 */
  computeCentrality(): Map<string, number> {
    const centrality = new Map<string, number>();
    let maxDegree = 1;
    for (const id of this.graph.nodes()) {
      const degree = this.graph.inDegree(id) + this.graph.outDegree(id);
      centrality.set(id, degree);
      if (degree > maxDegree) maxDegree = degree;
    }
    // Normalize
    for (const [id, degree] of centrality) {
      centrality.set(id, degree / maxDegree);
    }
    return centrality;
  }

  getRawGraph(): DirectedGraph {
    return this.graph;
  }
}
