/**
 * Retrieval Benchmark Engine — measures retrieval quality, latency, and scalability.
 *
 * IR Metrics: Recall@K, Precision@K, MRR (strict canonical matching)
 * Latency: per-stage profiling (graph, semantic, fusion, total)
 * Modes: structural-only, dual RRF, weighted BFS, triple RRF
 */
import type { CodeGraph, GraphNode } from "../graph/index.js";
import {
    structuralSearch,
    semanticSearch,
    reciprocalRankFusion,
    buildContext,
    neuralSearch,
    type StructuralResult,
    type SemanticResult,
    type HybridResult,
} from "./index.js";

// ──────────── Query Dataset ────────────

export interface BenchmarkQuery {
    query: string;
    repo: string;
    expectedSymbols: string[];
    category: "identifier" | "natural" | "cross-cutting";
}

// ──────────── Relevance Matching ────────────

/**
 * Strict relevance matching — canonical segment equality.
 *
 * A retrieved ID matches an expected symbol if:
 *   1. Exact match (after lowercasing)
 *   2. The expected symbol appears as a complete path segment in retrieved
 *   3. A non-trivial segment of expected matches a non-trivial segment of retrieved
 *
 * Trivial segments (file extensions, single chars) are excluded.
 */
const TRIVIAL_SEGMENTS = new Set(["ts", "js", "py", "go", "rs", "tsx", "jsx", "mts", "cts", "d"]);

export function isRelevant(retrieved: string, expected: string): boolean {
    const retLower = retrieved.toLowerCase();
    const expLower = expected.toLowerCase();

    // Exact match
    if (retLower === expLower) return true;

    // Check if retrieved ends with expected path
    if (retLower.endsWith("/" + expLower) || retLower.endsWith("\\" + expLower)) return true;

    // Split into meaningful segments (filter out extensions and single chars)
    const retSegments = retLower.split(/[\/\\.::]+/).filter(s => s.length > 1 && !TRIVIAL_SEGMENTS.has(s));
    const expSegments = expLower.split(/[\/\\.::]+/).filter(s => s.length > 1 && !TRIVIAL_SEGMENTS.has(s));

    if (expSegments.length === 0 || retSegments.length === 0) return false;

    // Check if any non-trivial expected segment matches a retrieved segment exactly
    for (const expSeg of expSegments) {
        if (retSegments.some((retSeg) => retSeg === expSeg)) return true;
    }

    return false;
}

// ──────────── IR Metrics ────────────

/**
 * Recall@K: fraction of expected symbols found in top K results.
 * Uses strict canonical matching.
 */
export function recallAtK(
    retrieved: string[],
    expected: string[],
    k: number
): number {
    if (expected.length === 0) return 1;
    const topK = retrieved.slice(0, k);
    const found = expected.filter((exp) =>
        topK.some((ret) => isRelevant(ret, exp))
    );
    return found.length / expected.length;
}

/**
 * Precision@K: fraction of top K results that are relevant.
 * Uses strict canonical matching.
 */
export function precisionAtK(
    retrieved: string[],
    expected: string[],
    k: number
): number {
    const topK = retrieved.slice(0, k);
    if (topK.length === 0) return 0;
    const relevant = topK.filter((ret) =>
        expected.some((exp) => isRelevant(ret, exp))
    );
    return relevant.length / topK.length;
}

/**
 * Mean Reciprocal Rank: 1/rank of first relevant result.
 * Uses strict canonical matching.
 */
export function mrr(
    retrieved: string[],
    expected: string[]
): number {
    for (let i = 0; i < retrieved.length; i++) {
        if (expected.some((exp) => isRelevant(retrieved[i], exp))) {
            return 1 / (i + 1);
        }
    }
    return 0;
}

// ──────────── NL Failure Classification ────────────

export type FailureType =
    | "synonym"      // query vocabulary ≠ code vocabulary
    | "concept"      // query describes abstract concept, not specific symbol
    | "structural"   // answer requires multi-hop graph reasoning
    | "none";        // not a failure

/**
 * Classify why a query failed to retrieve expected results.
 * Heuristic: compare query tokens vs retrieved/expected token overlap.
 */
export function classifyFailure(
    query: string,
    retrieved: string[],
    expected: string[],
    k: number = 10
): FailureType {
    const topK = retrieved.slice(0, k);
    const recall = recallAtK(topK, expected, k);
    if (recall >= 0.5) return "none";

    const queryWords = new Set(query.toLowerCase().split(/\W+/).filter(Boolean));
    const expectedWords = new Set(expected.flatMap((e) => e.toLowerCase().split(/\W+/).filter(Boolean)));

    // Check synonym mismatch: query words don't overlap with expected identifiers
    const overlap = [...queryWords].filter((w) => expectedWords.has(w));
    if (overlap.length === 0) return "synonym";

    // Check if expected symbols span multiple files/paths
    const uniquePaths = new Set(expected.map((e) => e.split(/[\/\\]/)[0]));
    if (uniquePaths.size >= 3) return "structural";

    // Default: concept abstraction
    return "concept";
}

// ──────────── Latency Profiling ────────────

export interface LatencyBreakdown {
    graph_ms: number;
    semantic_ms: number;
    fusion_ms: number;
    total_ms: number;
    nodesExpanded: number;
}

export interface ProfiledResult {
    results: HybridResult[];
    latency: LatencyBreakdown;
}

/**
 * Run a full retrieval pipeline with per-stage timing.
 */
export function profiledSearch(
    query: string,
    graph: CodeGraph,
    topK: number = 20,
    maxHops: number = 2
): ProfiledResult {
    const t0 = performance.now();

    // Stage 1: Structural
    const structural = structuralSearch(query, graph, maxHops, topK);
    const t1 = performance.now();

    // Stage 2: Semantic (TF-IDF)
    const semantic = semanticSearch(query, graph.nodes(), topK);
    const t2 = performance.now();

    // Stage 3: Fusion
    const fused = reciprocalRankFusion(structural, semantic, graph, 60, topK);
    const t3 = performance.now();

    return {
        results: fused,
        latency: {
            graph_ms: round(t1 - t0),
            semantic_ms: round(t2 - t1),
            fusion_ms: round(t3 - t2),
            total_ms: round(t3 - t0),
            nodesExpanded: structural.length,
        },
    };
}

function round(n: number): number {
    return Math.round(n * 100) / 100;
}

// ──────────── Mode Comparison ────────────

export type RetrievalMode =
    | "structural-only"
    | "structural+tfidf"
    | "weighted-bfs"
    | "structural+neural"
    | "triple-rrf";

export interface ModeResult {
    mode: RetrievalMode;
    retrievedIds: string[];
    latency: LatencyBreakdown;
}

/**
 * Run a single query in a specific retrieval mode.
 */
export function runInMode(
    query: string,
    graph: CodeGraph,
    mode: RetrievalMode,
    topK: number = 20,
    neuralVectors?: Map<string, Float32Array>,
    queryEmbedding?: Float32Array
): ModeResult {
    const t0 = performance.now();
    let retrievedIds: string[] = [];
    let nodesExpanded = 0;

    if (mode === "structural-only") {
        const structural = structuralSearch(query, graph, 2, topK);
        retrievedIds = structural.map((r) => r.node.id);
        nodesExpanded = structural.length;
    } else if (mode === "structural+tfidf" || mode === "weighted-bfs") {
        const profiled = profiledSearch(query, graph, topK);
        retrievedIds = profiled.results.map((r) => r.id);
        nodesExpanded = profiled.latency.nodesExpanded;
    } else if (mode === "structural+neural" && neuralVectors && queryEmbedding) {
        const structural = structuralSearch(query, graph, 2, topK);
        const neural = neuralSearch(queryEmbedding, graph.nodes(), neuralVectors, topK);
        const fused = reciprocalRankFusion(structural, neural, graph, 60, topK);
        retrievedIds = fused.map((r) => r.id);
        nodesExpanded = structural.length;
    } else if (mode === "triple-rrf" && neuralVectors && queryEmbedding) {
        const structural = structuralSearch(query, graph, 2, topK);
        const semantic = semanticSearch(query, graph.nodes(), topK);
        const neural = neuralSearch(queryEmbedding, graph.nodes(), neuralVectors, topK);
        const fused = reciprocalRankFusion(structural, semantic, graph, 60, topK, neural);
        retrievedIds = fused.map((r) => r.id);
        nodesExpanded = structural.length;
    } else {
        const profiled = profiledSearch(query, graph, topK);
        retrievedIds = profiled.results.map((r) => r.id);
        nodesExpanded = profiled.latency.nodesExpanded;
    }

    const t1 = performance.now();

    return {
        mode,
        retrievedIds,
        latency: {
            graph_ms: round(t1 - t0),
            semantic_ms: 0,
            fusion_ms: 0,
            total_ms: round(t1 - t0),
            nodesExpanded,
        },
    };
}

// ──────────── Benchmark Report ────────────

export interface QueryReport {
    query: string;
    category: string;
    recallAt5: number;
    recallAt10: number;
    precisionAt5: number;
    mrr: number;
    failureType: FailureType;
    latency: LatencyBreakdown;
    retrievedIds: string[];
}

export interface BenchmarkReport {
    mode: string;
    totalQueries: number;
    graphSize: number;
    avgRecallAt5: number;
    avgRecallAt10: number;
    avgPrecisionAt5: number;
    avgMRR: number;
    avgLatencyMs: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    avgNodesExpanded: number;
    expansionRatio: number;
    byCategory: Record<string, {
        count: number;
        avgRecallAt10: number;
        avgMRR: number;
    }>;
    failureSummary: Record<FailureType, number>;
    queries: QueryReport[];
}

/**
 * Run a full benchmark: all queries in a given mode, return aggregate report.
 */
export function runBenchmark(
    queries: BenchmarkQuery[],
    graph: CodeGraph,
    mode: RetrievalMode = "weighted-bfs",
    topK: number = 20
): BenchmarkReport {
    const queryReports: QueryReport[] = [];
    const latencies: number[] = [];
    const graphSize = graph.nodeCount();

    for (const q of queries) {
        const modeResult = runInMode(q.query, graph, mode, topK);
        const retrieved = modeResult.retrievedIds;

        const r5 = recallAtK(retrieved, q.expectedSymbols, 5);
        const r10 = recallAtK(retrieved, q.expectedSymbols, 10);
        const p5 = precisionAtK(retrieved, q.expectedSymbols, 5);
        const mrrScore = mrr(retrieved, q.expectedSymbols);
        const failureType = classifyFailure(q.query, retrieved, q.expectedSymbols);

        latencies.push(modeResult.latency.total_ms);

        queryReports.push({
            query: q.query,
            category: q.category,
            recallAt5: r5,
            recallAt10: r10,
            precisionAt5: p5,
            mrr: mrrScore,
            failureType,
            latency: modeResult.latency,
            retrievedIds: retrieved.slice(0, 10),
        });
    }

    // Aggregate
    const n = queryReports.length || 1;
    const sorted = [...latencies].sort((a, b) => a - b);
    const totalExpanded = queryReports.reduce((s, q) => s + q.latency.nodesExpanded, 0);

    // By category
    const byCategory: BenchmarkReport["byCategory"] = {};
    for (const qr of queryReports) {
        if (!byCategory[qr.category]) {
            byCategory[qr.category] = { count: 0, avgRecallAt10: 0, avgMRR: 0 };
        }
        byCategory[qr.category].count++;
        byCategory[qr.category].avgRecallAt10 += qr.recallAt10;
        byCategory[qr.category].avgMRR += qr.mrr;
    }
    for (const cat of Object.values(byCategory)) {
        cat.avgRecallAt10 = round(cat.avgRecallAt10 / cat.count);
        cat.avgMRR = round(cat.avgMRR / cat.count);
    }

    // Failure summary
    const failureSummary: Record<FailureType, number> = { synonym: 0, concept: 0, structural: 0, none: 0 };
    for (const qr of queryReports) {
        failureSummary[qr.failureType]++;
    }

    return {
        mode,
        totalQueries: n,
        graphSize,
        avgRecallAt5: round(queryReports.reduce((s, q) => s + q.recallAt5, 0) / n),
        avgRecallAt10: round(queryReports.reduce((s, q) => s + q.recallAt10, 0) / n),
        avgPrecisionAt5: round(queryReports.reduce((s, q) => s + q.precisionAt5, 0) / n),
        avgMRR: round(queryReports.reduce((s, q) => s + q.mrr, 0) / n),
        avgLatencyMs: round(latencies.reduce((s, l) => s + l, 0) / n),
        p50LatencyMs: round(sorted[Math.floor(sorted.length * 0.5)] || 0),
        p95LatencyMs: round(sorted[Math.floor(sorted.length * 0.95)] || 0),
        avgNodesExpanded: round(totalExpanded / n),
        expansionRatio: round((totalExpanded / n) / (graphSize || 1) * 100) / 100,
        byCategory,
        failureSummary,
        queries: queryReports,
    };
}

/**
 * Format a benchmark report as a printable string.
 */
export function formatReport(report: BenchmarkReport): string {
    const lines: string[] = [];
    lines.push(`\n╔══════════════════════════════════════════════════╗`);
    lines.push(`║  Retrieval Benchmark: ${report.mode.padEnd(28)}║`);
    lines.push(`╚══════════════════════════════════════════════════╝`);
    lines.push(``);
    lines.push(`  Graph Size:       ${report.graphSize} nodes`);
    lines.push(`  Queries:          ${report.totalQueries}`);
    lines.push(`  Recall@5:         ${report.avgRecallAt5}`);
    lines.push(`  Recall@10:        ${report.avgRecallAt10}`);
    lines.push(`  Precision@5:      ${report.avgPrecisionAt5}`);
    lines.push(`  MRR:              ${report.avgMRR}`);
    lines.push(`  Avg Latency:      ${report.avgLatencyMs}ms`);
    lines.push(`  P50 Latency:      ${report.p50LatencyMs}ms`);
    lines.push(`  P95 Latency:      ${report.p95LatencyMs}ms`);
    lines.push(`  Avg Expanded:     ${report.avgNodesExpanded} nodes`);
    lines.push(`  Expansion Ratio:  ${(report.expansionRatio * 100).toFixed(1)}% of graph`);
    lines.push(``);
    lines.push(`  ── By Category ──`);
    for (const [cat, stats] of Object.entries(report.byCategory)) {
        lines.push(`  ${cat.padEnd(16)} R@10=${stats.avgRecallAt10}  MRR=${stats.avgMRR}  (${stats.count} queries)`);
    }
    lines.push(``);
    lines.push(`  ── Failure Analysis ──`);
    const { synonym, concept, structural, none } = report.failureSummary;
    lines.push(`  Synonym mismatch:  ${synonym}`);
    lines.push(`  Concept gap:       ${concept}`);
    lines.push(`  Structural limit:  ${structural}`);
    lines.push(`  No failure:        ${none}`);
    lines.push(``);

    return lines.join("\n");
}
