import DirectedGraph from "graphology";
import type { ParsedNode, ParsedEdge } from "../parser/types.js";
export interface GraphNode extends ParsedNode {
    summary?: string;
    tags?: string[];
    stale: boolean;
    last_indexed: string;
}
export interface GraphEdge extends ParsedEdge {
}
export declare class CodeGraph {
    private graph;
    constructor();
    addNode(node: GraphNode): void;
    addEdge(edge: GraphEdge): void;
    getNode(id: string): GraphNode | undefined;
    updateNode(id: string, attrs: Partial<GraphNode>): void;
    hasNode(id: string): boolean;
    removeNode(id: string): void;
    nodes(): GraphNode[];
    edges(): GraphEdge[];
    nodeCount(): number;
    edgeCount(): number;
    /** Returns direct predecessors (nodes that have edges pointing TO id) */
    predecessors(id: string): GraphNode[];
    /** Returns direct successors (nodes that id has edges pointing TO) */
    successors(id: string): GraphNode[];
    /** Find all nodes whose id or name fuzzy-matches the query */
    search(query: string): GraphNode[];
    /** Transitive dependents up to maxDepth hops */
    transitiveSuccessors(id: string, maxDepth?: number): GraphNode[];
    /** Transitive predecessors (who depends on this?) */
    transitivePredecessors(id: string, maxDepth?: number): GraphNode[];
    /** Entry points = nodes with no incoming edges */
    entryPoints(): GraphNode[];
    /** Mark a node as stale, also stale all nodes that import it */
    markStale(id: string): void;
    staleNodes(): GraphNode[];
    getRawGraph(): DirectedGraph;
}
//# sourceMappingURL=index.d.ts.map