import type { GraphNode, GraphEdge, CodeGraph } from "../graph/index.js";
import {
    tokenize,
    buildVocabulary,
    toVector,
    cosineSimilarity,
    embedQuery,
    ANNIndex,
    type Vocabulary,
} from "../embedding/index.js";
import { PriorityQueue } from "./priority-queue.js";

// ──────────── Edge Type Weights ────────────

const EDGE_WEIGHTS: Record<string, number> = {
    calls: 1.0,
    imports: 0.8,
    inherits: 0.7,
    implements: 0.6,
    contains: 0.3,
};

function edgeWeight(type: string): number {
    return EDGE_WEIGHTS[type] ?? 0.5;
}

// ──────────── Scoring Coefficients ────────────

/** Default weights for the composite neighbor score */
export const DEFAULT_WEIGHTS = {
    /** Weight for semantic overlap (TF-IDF similarity between query and node) */
    alpha: 0.5,
    /** Weight for edge type importance */
    beta: 0.3,
    /** Weight for node centrality (hub importance) */
    gamma: 0.2,
};

// ──────────── Structural Retriever ────────────

export interface StructuralResult {
    node: GraphNode;
    score: number;
    hops: number;
    /** How we reached this node */
    path: string[];
}

export interface TraversalOptions {
    /** Max nodes to visit (default: 200) */
    budget?: number;
    /** Minimum score to continue expanding (default: 0.05) */
    scoreThreshold?: number;
    /** Scoring weights */
    weights?: { alpha?: number; beta?: number; gamma?: number };
    /** Max results to return */
    maxResults?: number;
}

/**
 * Relevance-guided best-first graph traversal.
 *
 * Replaces uniform BFS with a priority-queue search that scores each
 * neighbor by: α·semantic_overlap + β·edge_weight + γ·centrality
 *
 * Terminates when: score drops below threshold, budget exhausted, or
 * no more reachable nodes.
 */
export function structuralSearch(
    query: string,
    graph: CodeGraph,
    maxHops: number = 2,
    maxResults: number = 20,
    opts: TraversalOptions = {}
): StructuralResult[] {
    const {
        budget = 200,
        scoreThreshold = 0.05,
        weights: w = {},
    } = opts;
    const alpha = w.alpha ?? DEFAULT_WEIGHTS.alpha;
    const beta = w.beta ?? DEFAULT_WEIGHTS.beta;
    const gamma = w.gamma ?? DEFAULT_WEIGHTS.gamma;
    const limit = opts.maxResults ?? maxResults;

    const queryTokens = tokenize(query).map((t) => t.toLowerCase());
    const results: StructuralResult[] = [];
    const visited = new Set<string>();

    // Precompute centrality scores
    const centrality = graph.computeCentrality();

    // Build a small TF-IDF vocab from all node names+summaries for semantic overlap
    const allNodes = graph.nodes();
    const nodeTexts = allNodes.map((n) =>
        tokenize([n.name || "", n.path || "", n.summary || "", (n.tags || []).join(" ")].join(" "))
    );
    const vocab = buildVocabulary([...nodeTexts, queryTokens]);
    const queryVec = toVector(queryTokens, vocab);

    // Map node id → precomputed vector for fast lookup
    const nodeVecMap = new Map<string, Float32Array>();
    for (let i = 0; i < allNodes.length; i++) {
        nodeVecMap.set(allNodes[i].id, toVector(nodeTexts[i], vocab));
    }

    /** Compute semantic overlap between query and a node */
    function semanticOverlap(nodeId: string): number {
        const vec = nodeVecMap.get(nodeId);
        if (!vec) return 0;
        return Math.max(0, cosineSimilarity(queryVec, vec));
    }

    // Phase 1: Direct name/path matches (seeds)
    for (const node of allNodes) {
        const nameTokens = tokenize(node.name || "").map((t) => t.toLowerCase());
        const pathTokens = tokenize(node.path || "").map((t) => t.toLowerCase());
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

    // Phase 2: Best-first expansion from seeds using priority queue
    const pq = new PriorityQueue<{ id: string; hops: number; parentPath: string[] }>();

    // Seed the priority queue with neighbors of direct matches
    for (const r of results) {
        const outEdges = graph.edgesFrom(r.node.id);
        const inEdges = graph.edgesTo(r.node.id);
        for (const edge of [...outEdges, ...inEdges]) {
            const neighborId = edge.source === r.node.id ? edge.target : edge.source;
            if (visited.has(neighborId)) continue;

            const sem = semanticOverlap(neighborId);
            const ew = edgeWeight(edge.type);
            const cent = centrality.get(neighborId) ?? 0;
            const priority = alpha * sem + beta * ew + gamma * cent;

            pq.push(
                { id: neighborId, hops: 1, parentPath: [r.node.id, neighborId] },
                priority
            );
        }
    }

    let nodesExpanded = results.length;

    // Best-first expansion
    while (pq.size > 0 && nodesExpanded < budget) {
        const topPriority = pq.peekPriority();
        if (topPriority < scoreThreshold) break; // Early termination: score too low

        const entry = pq.pop()!;
        if (visited.has(entry.id)) continue;
        visited.add(entry.id);
        nodesExpanded++;

        const neighborNode = graph.getNode(entry.id);
        if (!neighborNode) continue;

        results.push({
            node: neighborNode,
            score: topPriority,
            hops: entry.hops,
            path: entry.parentPath,
        });

        // Expand this node's neighbors if within hop limit
        if (entry.hops < maxHops) {
            const outEdges = graph.edgesFrom(entry.id);
            const inEdges = graph.edgesTo(entry.id);
            for (const edge of [...outEdges, ...inEdges]) {
                const nextId = edge.source === entry.id ? edge.target : edge.source;
                if (visited.has(nextId)) continue;

                const sem = semanticOverlap(nextId);
                const ew = edgeWeight(edge.type);
                const cent = centrality.get(nextId) ?? 0;
                const hopDecay = 1 / (entry.hops + 1);
                const priority = (alpha * sem + beta * ew + gamma * cent) * hopDecay;

                pq.push(
                    { id: nextId, hops: entry.hops + 1, parentPath: [...entry.parentPath, nextId] },
                    priority
                );
            }
        }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
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

// ──────────── Neural Retriever (optional) ────────────

/**
 * Search using pre-stored neural embedding vectors.
 * Returns empty results if no vectors are stored.
 */
export function neuralSearch(
    query: Float32Array,
    nodes: GraphNode[],
    vectors: Map<string, Float32Array>,
    k: number = 20
): SemanticResult[] {
    if (vectors.size === 0) return [];

    const results: SemanticResult[] = [];
    for (const node of nodes) {
        const vec = vectors.get(node.id);
        if (!vec) continue;
        results.push({
            id: node.id,
            score: cosineSimilarity(query, vec),
        });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, k);
}

/**
 * Semantic Query Expansion
 *
 * Uses dense embeddings to find semantic neighbors for a query,
 * extracts their lexical identifiers (names, tags), and injects
 * them back into the query.
 *
 * This bridges the vocabulary gap (e.g., "authentication" -> "verifyJWT")
 * BEFORE candidate generation, giving the TF-IDF and BFS algorithms
 * the correct vocabulary to search for.
 */
export function expandQuerySemantically(
    originalQuery: string,
    queryVec: Float32Array,
    nodes: GraphNode[],
    vectors: Map<string, Float32Array>,
    k: number = 3
): string {
    // 1. Find top K semantic neighbors using dense embeddings
    const neighbors = neuralSearch(queryVec, nodes, vectors, k);

    if (neighbors.length === 0) {
        return originalQuery; // No expansion possible
    }

    // 2. Extract pseudo-lexical terms from the neighbors
    const expansionTerms = new Set<string>();
    for (const res of neighbors) {
        const node = nodes.find((n) => n.id === res.id);
        if (node) {
            // Inject the explicit name of the semantic match
            if (node.name) expansionTerms.add(node.name);
            // Optionally inject tags or exports if they are highly relevant
            if (node.tags) node.tags.forEach((t) => expansionTerms.add(t));
        }
    }

    // 3. Combine original query with the injected terms
    // We append them to the query so structuralSearch/TF-IDF can tokenize them
    const injected = Array.from(expansionTerms).join(" ");
    return injected.length > 0 ? `${originalQuery} ${injected}` : originalQuery;
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
 * Merge structural, semantic (TF-IDF), and optional neural results
 * using Reciprocal Rank Fusion.
 * @param k - RRF constant (default: 60)
 */
export function reciprocalRankFusion(
    structural: StructuralResult[],
    semantic: SemanticResult[],
    graph: CodeGraph,
    k: number = 60,
    maxResults: number = 20,
    neural: SemanticResult[] = []
): HybridResult[] {
    const scoreMap = new Map<string, {
        structuralScore: number;
        semanticScore: number;
        structuralRank: number;
        semanticRank: number;
        neuralRank: number;
        hops: number;
    }>();

    // Structural scores
    structural.forEach((r, i) => {
        scoreMap.set(r.node.id, {
            structuralScore: r.score,
            semanticScore: 0,
            structuralRank: i + 1,
            semanticRank: Infinity,
            neuralRank: Infinity,
            hops: r.hops,
        });
    });

    // Semantic (TF-IDF) scores
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
                neuralRank: Infinity,
                hops: -1,
            });
        }
    });

    // Neural scores (optional)
    neural.forEach((r, i) => {
        const existing = scoreMap.get(r.id);
        if (existing) {
            existing.neuralRank = i + 1;
        } else {
            scoreMap.set(r.id, {
                structuralScore: 0,
                semanticScore: 0,
                structuralRank: Infinity,
                semanticRank: Infinity,
                neuralRank: i + 1,
                hops: -1,
            });
        }
    });

    // Fuse with RRF (2 or 3 signals)
    const results: HybridResult[] = [];
    for (const [id, scores] of scoreMap) {
        const node = graph.getNode(id);
        if (!node) continue;

        const rrfStructural = scores.structuralRank < Infinity
            ? 1 / (k + scores.structuralRank) : 0;
        const rrfSemantic = scores.semanticRank < Infinity
            ? 1 / (k + scores.semanticRank) : 0;
        const rrfNeural = scores.neuralRank < Infinity
            ? 1 / (k + scores.neuralRank) : 0;

        results.push({
            id,
            node,
            structuralScore: scores.structuralScore,
            semanticScore: scores.semanticScore,
            fusedScore: rrfStructural + rrfSemantic + rrfNeural,
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
    /** Pre-stored neural vectors (node id → Float32Array) */
    neuralVectors?: Map<string, Float32Array>;
    /** Pre-computed query embedding */
    queryEmbedding?: Float32Array;
}

/**
 * Full hybrid retrieval pipeline.
 * Uses triple RRF (structural + tfidf + neural) when vectors are available,
 * falls back to dual RRF (structural + tfidf) otherwise.
 */
export function hybridRetrieve(
    query: string,
    graph: CodeGraph,
    opts: PipelineOptions = {}
): RetrievalContext {
    const { maxHops = 2, topK = 20, tokenBudget = 4000, rrfK = 60 } = opts;

    // Stage 1: Structural search (weighted best-first)
    const structural = structuralSearch(query, graph, maxHops, topK);

    // Stage 2: Semantic search (TF-IDF)
    const semantic = semanticSearch(query, graph.nodes(), topK);

    // Stage 3: Neural search (optional, uses pre-stored vectors)
    let neural: SemanticResult[] = [];
    if (opts.neuralVectors && opts.queryEmbedding && opts.neuralVectors.size > 0) {
        neural = neuralSearch(opts.queryEmbedding, graph.nodes(), opts.neuralVectors, topK);
    }

    // Stage 4: Fusion (2 or 3 signals)
    const fused = reciprocalRankFusion(structural, semantic, graph, rrfK, topK, neural);

    // Stage 5: Context assembly
    return buildContext(fused, query, tokenBudget);
}
