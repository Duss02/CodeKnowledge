import type { GraphNode, GraphEdge } from "../graph/index.js";
export declare class GraphStore {
    private db;
    private dbPath;
    private constructor();
    /**
     * Open or create a GraphStore at the given directory.
     * If the database file doesn't exist, it creates one with the schema.
     */
    static open(outputDir: string): Promise<GraphStore>;
    /**
     * Create an in-memory GraphStore (for testing).
     */
    static inMemory(): Promise<GraphStore>;
    upsertNode(node: GraphNode): void;
    getNode(id: string): GraphNode | undefined;
    hasNode(id: string): boolean;
    removeNode(id: string): void;
    updateNode(id: string, updates: Partial<GraphNode>): void;
    allNodes(): GraphNode[];
    nodeCount(): number;
    nodesByType(type: string): GraphNode[];
    staleNodes(): GraphNode[];
    markStale(id: string): void;
    clearStale(id: string): void;
    upsertEdge(edge: GraphEdge): void;
    allEdges(): GraphEdge[];
    edgeCount(): number;
    edgesFrom(source: string): GraphEdge[];
    edgesTo(target: string): GraphEdge[];
    removeEdgesFor(nodeId: string): void;
    /**
     * Bulk upsert nodes and edges within a single transaction for performance.
     */
    bulkUpsert(nodes: GraphNode[], edges: GraphEdge[]): void;
    /**
     * Clear all nodes and edges.
     */
    clear(): void;
    /**
     * Save the in-memory database to disk.
     */
    save(): Promise<void>;
    /**
     * Get schema version.
     */
    schemaVersion(): number;
    /**
     * Close the database.
     */
    close(): void;
    private rowToNode;
}
//# sourceMappingURL=index.d.ts.map