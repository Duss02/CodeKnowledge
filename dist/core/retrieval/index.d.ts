/**
 * Hybrid Retrieval Pipeline — combines structural graph search
 * with ANN embedding search for code discovery.
 *
 * Pipeline stages:
 *   1. Structural: BFS from matching nodes through edges
 *   2. Semantic: ANN nearest-neighbor embedding search
 *   3. Merge: RRF (Reciprocal Rank Fusion) ranking
 *   4. Context: Token-budgeted context window assembly
 */
import type { GraphNode, CodeGraph } from "../graph/index.js";
export interface StructuralResult {
    node: GraphNode;
    score: number;
    hops: number;
    /** How we reached this node */
    path: string[];
}
/**
 * Find nodes by name/path match, then walk the graph for related nodes.
 */
export declare function structuralSearch(query: string, graph: CodeGraph, maxHops?: number, maxResults?: number): StructuralResult[];
export interface SemanticResult {
    id: string;
    score: number;
}
/**
 * Embed all nodes and search with a query string.
 */
export declare function semanticSearch(query: string, nodes: GraphNode[], k?: number): SemanticResult[];
export interface HybridResult {
    id: string;
    node: GraphNode;
    structuralScore: number;
    semanticScore: number;
    fusedScore: number;
    hops: number;
}
/**
 * Merge structural and semantic results using Reciprocal Rank Fusion.
 * @param k - RRF constant (default: 60)
 */
export declare function reciprocalRankFusion(structural: StructuralResult[], semantic: SemanticResult[], graph: CodeGraph, k?: number, maxResults?: number): HybridResult[];
export interface ContextChunk {
    nodeId: string;
    nodeName: string;
    nodeType: string;
    path: string;
    summary?: string;
    content: string;
    tokens: number;
}
export interface RetrievalContext {
    chunks: ContextChunk[];
    totalTokens: number;
    query: string;
    nodesSearched: number;
}
/**
 * Estimate token count (~4 chars per token, standard approximation).
 */
export declare function estimateTokens(text: string): number;
/**
 * Build a token-budgeted context from hybrid search results.
 * Prioritizes top-ranked results, stops when budget is exceeded.
 */
export declare function buildContext(results: HybridResult[], query: string, tokenBudget?: number): RetrievalContext;
export interface PipelineOptions {
    maxHops?: number;
    topK?: number;
    tokenBudget?: number;
    rrfK?: number;
}
/**
 * Full hybrid retrieval pipeline.
 */
export declare function hybridRetrieve(query: string, graph: CodeGraph, opts?: PipelineOptions): RetrievalContext;
//# sourceMappingURL=index.d.ts.map