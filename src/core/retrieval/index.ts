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
import type { GraphNode, GraphEdge, CodeGraph } from "../graph/index.js";
import {
    tokenize,
    buildVocabulary,
    toVector,
    embedQuery,
    ANNIndex,
    type Vocabulary,
} from "../embedding/index.js";

// ──────────── Structural Retriever ────────────

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
export function structuralSearch(
    query: string,
    graph: CodeGraph,
    maxHops: number = 2,
    maxResults: number = 20
): StructuralResult[] {
    const queryTokens = tokenize(query).map((t) => t.toLowerCase());
    const results: StructuralResult[] = [];
    const visited = new Set<string>();

    // Phase 1: Direct name/path matches
    for (const node of graph.nodes()) {
        const nameTokens = tokenize(node.name).map((t) => t.toLowerCase());
        const pathTokens = tokenize(node.path).map((t) => t.toLowerCase());
        const allTokens = [...nameTokens, ...pathTokens];

        const matchCount = queryTokens.filter((qt) =>
            allTokens.some((nt) => nt.includes(qt) || qt.includes(nt))
        ).length;

        if (matchCount > 0) {
            const score = matchCount / queryTokens.length;
            results.push({ node, score, hops: 0, path: [node.id] });
            visited.add(node.id);
        }
    }

    // Phase 2: BFS expansion from matched nodes
    let frontier = results.map((r) => r.node.id);
    for (let hop = 1; hop <= maxHops && frontier.length > 0; hop++) {
        const nextFrontier: string[] = [];
        for (const nodeId of frontier) {
            // Get edges from and to this node
            const neighbors = new Set<string>();
            for (const e of graph.edges()) {
                if (e.source === nodeId && !visited.has(e.target)) neighbors.add(e.target);
                if (e.target === nodeId && !visited.has(e.source)) neighbors.add(e.source);
            }
            for (const neighbor of neighbors) {
                if (visited.has(neighbor)) continue;
                visited.add(neighbor);
                const neighborNode = graph.getNode(neighbor);
                if (neighborNode) {
                    const hopDecay = 1 / (hop + 1);
                    results.push({
                        node: neighborNode,
                        score: hopDecay,
                        hops: hop,
                        path: [nodeId, neighbor],
                    });
                    nextFrontier.push(neighbor);
                }
            }
        }
        frontier = nextFrontier;
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, maxResults);
}

// ──────────── Semantic Retriever ────────────

export interface SemanticResult {
    id: string;
    score: number;
}

/**
 * Embed all nodes and search with a query string.
 */
export function semanticSearch(
    query: string,
    nodes: GraphNode[],
    k: number = 20
): SemanticResult[] {
    // Build document corpus from node summaries + names
    const docs = nodes.map((n) => ({
        id: n.id,
        text: [n.name, n.path, n.summary || "", (n.tags || []).join(" ")].join(" "),
    }));

    const corpus = docs.map((d) => tokenize(d.text));
    const vocab = buildVocabulary(corpus);

    const index = new ANNIndex();
    for (let i = 0; i < docs.length; i++) {
        index.add(docs[i].id, toVector(corpus[i], vocab));
    }

    const queryVec = embedQuery(query, vocab);
    return index.search(queryVec, k);
}

// ──────────── Reciprocal Rank Fusion ────────────

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
export function reciprocalRankFusion(
    structural: StructuralResult[],
    semantic: SemanticResult[],
    graph: CodeGraph,
    k: number = 60,
    maxResults: number = 20
): HybridResult[] {
    const scoreMap = new Map<string, {
        structuralScore: number;
        semanticScore: number;
        structuralRank: number;
        semanticRank: number;
        hops: number;
    }>();

    // Structural scores
    structural.forEach((r, i) => {
        scoreMap.set(r.node.id, {
            structuralScore: r.score,
            semanticScore: 0,
            structuralRank: i + 1,
            semanticRank: Infinity,
            hops: r.hops,
        });
    });

    // Semantic scores
    semantic.forEach((r, i) => {
        const existing = scoreMap.get(r.id);
        if (existing) {
            existing.semanticScore = r.score;
            existing.semanticRank = i + 1;
        } else {
            scoreMap.set(r.id, {
                structuralScore: 0,
                semanticScore: r.score,
                structuralRank: Infinity,
                semanticRank: i + 1,
                hops: -1,
            });
        }
    });

    // Fuse with RRF
    const results: HybridResult[] = [];
    for (const [id, scores] of scoreMap) {
        const node = graph.getNode(id);
        if (!node) continue;

        const rrfStructural = scores.structuralRank < Infinity
            ? 1 / (k + scores.structuralRank) : 0;
        const rrfSemantic = scores.semanticRank < Infinity
            ? 1 / (k + scores.semanticRank) : 0;

        results.push({
            id,
            node,
            structuralScore: scores.structuralScore,
            semanticScore: scores.semanticScore,
            fusedScore: rrfStructural + rrfSemantic,
            hops: scores.hops,
        });
    }

    results.sort((a, b) => b.fusedScore - a.fusedScore);
    return results.slice(0, maxResults);
}

// ──────────── Context Builder ────────────

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
export function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

/**
 * Build a token-budgeted context from hybrid search results.
 * Prioritizes top-ranked results, stops when budget is exceeded.
 */
export function buildContext(
    results: HybridResult[],
    query: string,
    tokenBudget: number = 4000
): RetrievalContext {
    const chunks: ContextChunk[] = [];
    let totalTokens = 0;

    for (const result of results) {
        const content = [
            `// ${result.node.type}: ${result.node.name}`,
            `// Path: ${result.node.path}`,
            result.node.summary ? `// Summary: ${result.node.summary}` : "",
            result.node.exports?.length
                ? `// Exports: ${result.node.exports.join(", ")}`
                : "",
        ]
            .filter(Boolean)
            .join("\n");

        const chunkTokens = estimateTokens(content);
        if (totalTokens + chunkTokens > tokenBudget) break;

        chunks.push({
            nodeId: result.id,
            nodeName: result.node.name,
            nodeType: result.node.type,
            path: result.node.path,
            summary: result.node.summary,
            content,
            tokens: chunkTokens,
        });
        totalTokens += chunkTokens;
    }

    return {
        chunks,
        totalTokens,
        query,
        nodesSearched: results.length,
    };
}

// ──────────── Full Pipeline ────────────

export interface PipelineOptions {
    maxHops?: number;
    topK?: number;
    tokenBudget?: number;
    rrfK?: number;
}

/**
 * Full hybrid retrieval pipeline.
 */
export function hybridRetrieve(
    query: string,
    graph: CodeGraph,
    opts: PipelineOptions = {}
): RetrievalContext {
    const { maxHops = 2, topK = 20, tokenBudget = 4000, rrfK = 60 } = opts;

    // Stage 1: Structural search
    const structural = structuralSearch(query, graph, maxHops, topK);

    // Stage 2: Semantic search
    const semantic = semanticSearch(query, graph.nodes(), topK);

    // Stage 3: Fusion
    const fused = reciprocalRankFusion(structural, semantic, graph, rrfK, topK);

    // Stage 4: Context assembly
    return buildContext(fused, query, tokenBudget);
}
