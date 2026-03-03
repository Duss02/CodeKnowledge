import { CodeGraph, type GraphNode } from "./index.js";
export interface QueryResult {
    node: GraphNode;
    dependencies: GraphNode[];
    dependents: GraphNode[];
}
export interface ImpactResult {
    changed: GraphNode;
    affected: Array<{
        node: GraphNode;
        depth: number;
        via: string;
    }>;
}
export declare function queryNode(graph: CodeGraph, pathOrId: string): QueryResult | null;
export declare function findUsages(graph: CodeGraph, symbol: string): GraphNode[];
export declare function computeImpact(graph: CodeGraph, pathOrId: string, maxDepth?: number): ImpactResult | null;
export declare function getEntryPoints(graph: CodeGraph): GraphNode[];
export declare function getOverview(graph: CodeGraph): {
    totalNodes: number;
    totalEdges: number;
    fileCount: number;
    classCount: number;
    functionCount: number;
    languages: Record<string, number>;
    entryPoints: GraphNode[];
    staleCount: number;
};
//# sourceMappingURL=query.d.ts.map