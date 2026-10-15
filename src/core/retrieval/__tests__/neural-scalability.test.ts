/**
 * T17 — Neural Scalability Profiler
 *
 * Measures latency breakdown (BFS vs TF-IDF vs Dense Search) across
 * graphs of 300, 3k, and 10k nodes with 1536-dim dense vectors.
 *
 * Validates whether O(N) cosine similarity becomes a bottleneck for
 * large codebases and warrants ANN (Approximate Nearest Neighbors).
 */
import { describe, it, expect } from "vitest";
import { CodeGraph } from "../../graph/index.js";
import type { GraphNode, GraphEdge } from "../../graph/index.js";
import {
    structuralSearch,
    semanticSearch,
    neuralSearch,
    reciprocalRankFusion,
} from "../index.js";
import { tokenize, buildVocabulary, toVector } from "../../embedding/index.js";

// ────────── Synthetic Graph & Vectors ──────────

function generateRandomFloat32Array(dim: number): Float32Array {
    const arr = new Float32Array(dim);
    for (let i = 0; i < dim; i++) {
        arr[i] = Math.random() * 2 - 1; // [-1, 1]
    }
    // L2 normalize
    let sum = 0;
    for (let i = 0; i < dim; i++) sum += arr[i] * arr[i];
    const magnitude = Math.sqrt(sum);
    for (let i = 0; i < dim; i++) arr[i] /= magnitude;
    return arr;
}

function buildSyntheticGraphAndVectors(
    nodeCount: number,
    dim: number = 1536
): { graph: CodeGraph; neuralVectors: Map<string, Float32Array> } {
    const graph = new CodeGraph();
    const neuralVectors = new Map<string, Float32Array>();

    const nodes: GraphNode[] = [];
    for (let i = 0; i < nodeCount; i++) {
        const id = `node_${i}.ts`;
        const node: GraphNode = {
            id,
            name: `Node${i}`,
            path: `src/node_${i}.ts`,
            type: "file",
            language: "typescript",
            lines: [1, 100],
            hash: "abc",
            exports: [],
            tags: [],
            summary: `This is synthetic node ${i}`,
            stale: false,
            last_indexed: new Date().toISOString()
        };
        graph.addNode(node);
        nodes.push(node);

        neuralVectors.set(id, generateRandomFloat32Array(dim));
    }

    // Connect nodes in a chain + tree to ensure BFS has something to traverse
    for (let i = 0; i < nodeCount - 1; i++) {
        graph.addEdge({
            source: nodes[i].id,
            target: nodes[i + 1].id,
            type: "imports",
            via: ""
        });
        if (i * 2 + 1 < nodeCount) {
            graph.addEdge({
                source: nodes[i].id,
                target: nodes[i * 2 + 1].id,
                type: "calls",
                via: ""
            });
        }
    }

    return { graph, neuralVectors };
}

// ────────── Performance Profiler ──────────

describe("T17 — Neural Scalability Profiler", () => {
    const sizes = [300, 3000, 10000];
    const DIM = 1536; // OpenAI text-embedding-3-small dim
    const QUERY = "synthetic query about node 42";

    for (const size of sizes) {
        it(`profiles dense similarity limit at ${size} nodes`, () => {
            console.log(`\n  ═══ SCALABILITY: ${size} NODES ═══`);

            const t0 = performance.now();
            const { graph, neuralVectors } = buildSyntheticGraphAndVectors(size, DIM);
            const buildMs = performance.now() - t0;
            console.log(`  Graph & vectors built in ${Math.round(buildMs)}ms`);

            expect(graph.nodeCount()).toBe(size);
            expect(neuralVectors.size).toBe(size);

            // Need to build TF-IDF vocab for the graph to benchmark it
            const t1 = performance.now();
            const texts = graph.nodes().map(n => tokenize(n.summary || ""));
            const vocab = buildVocabulary(texts);
            const vocabMs = performance.now() - t1;
            console.log(`  TF-IDF vocab built in ${Math.round(vocabMs)}ms (${vocab.termIndex.size} terms)`);

            // 1. Benchmark Graph Traversal (Weighted BFS)
            const graphMs: number[] = [];
            for (let i = 0; i < 5; i++) {
                const s0 = performance.now();
                structuralSearch(QUERY, graph, 2, 20);
                graphMs.push(performance.now() - s0);
            }
            const avgGraph = graphMs.reduce((a, b) => a + b, 0) / graphMs.length;

            // 2. Benchmark TF-IDF Search (Semantic Search)
            // Note: semanticSearch builds tf-idf vectors on the fly for all nodes.
            const tfidfMs: number[] = [];
            for (let i = 0; i < 5; i++) {
                const s0 = performance.now();
                semanticSearch(QUERY, graph.nodes(), 20);
                tfidfMs.push(performance.now() - s0);
            }
            const avgTfidf = tfidfMs.reduce((a, b) => a + b, 0) / tfidfMs.length;

            // 3. Benchmark Dense Neural Search (O(N) Cosine Similarity)
            const denseMs: number[] = [];
            const queryVec = generateRandomFloat32Array(DIM);
            for (let i = 0; i < 5; i++) {
                const s0 = performance.now();
                neuralSearch(queryVec, graph.nodes(), neuralVectors, 20);
                denseMs.push(performance.now() - s0);
            }
            const avgDense = denseMs.reduce((a, b) => a + b, 0) / denseMs.length;

            // 4. Benchmark Fusion (RRF)
            const fusionMs: number[] = [];
            const r1 = structuralSearch(QUERY, graph, 2, 20);
            const r2 = neuralSearch(queryVec, graph.nodes(), neuralVectors, 20);
            for (let i = 0; i < 5; i++) {
                const s0 = performance.now();
                reciprocalRankFusion(r1, r2, graph, 60, 20);
                fusionMs.push(performance.now() - s0);
            }
            const avgFusion = fusionMs.reduce((a, b) => a + b, 0) / fusionMs.length;

            console.log(`  Latency Breakdown (avg of 5 runs):`);
            console.log(`    Graph Traversal: ${avgGraph.toFixed(2).padStart(8)} ms`);
            console.log(`    Sparse TF-IDF:   ${avgTfidf.toFixed(2).padStart(8)} ms`);
            console.log(`    Dense Search:    ${avgDense.toFixed(2).padStart(8)} ms`);
            console.log(`    RRF Fusion:      ${avgFusion.toFixed(2).padStart(8)} ms`);

            const totalRRF = avgGraph + avgDense + avgFusion;
            console.log(`  Total End-to-End:  ${totalRRF.toFixed(2).padStart(8)} ms`);

            // Assertions to ensure dense search works
            const testRes = neuralSearch(queryVec, graph.nodes(), neuralVectors, 20);
            expect(testRes.length).toBeGreaterThan(0);
            expect(testRes[0].score).toBeLessThanOrEqual(1.0); // cosine similarity bounds
        }, 60000);
    }
});
