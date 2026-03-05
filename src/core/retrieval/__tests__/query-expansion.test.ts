/**
 * T18 — Semantic Query Expansion Benchmark
 *
 * Compares two approaches to using dense neural embeddings:
 * 1. Ranking injection: RRF(structural, neural) (T16 approach)
 * 2. Query expansion: expandQuerySemantically() -> RRF(structural, tfidf)
 *
 * Query expansion injects learned identifiers (from dense neighbors)
 * directly into the query BEFORE sparse/BFS search, allowing the
 * entire pipeline to operate on the correct vocabulary.
 */
import { describe, it, expect } from "vitest";
import { CodeGraph } from "../../graph/index.js";
import { parseFile } from "../../parser/index.js";
import { embedTexts, embedSingle, nodeToEmbeddingText } from "../../embedding/neural.js";
import {
    structuralSearch,
    semanticSearch,
    neuralSearch,
    reciprocalRankFusion,
    expandQuerySemantically
} from "../index.js";
import {
    recallAtK,
    mrr as computeMRR,
    classifyFailure,
    type BenchmarkQuery,
} from "../benchmark.js";
import type { CKConfig } from "../../config/index.js";
import { DEFAULT_CONFIG } from "../../config/index.js";
import path from "path";
import fs from "fs";

const queriesPath = path.resolve(__dirname, "queries.json");
const allQueries: BenchmarkQuery[] = JSON.parse(fs.readFileSync(queriesPath, "utf-8"));

const config: CKConfig = {
    ...DEFAULT_CONFIG,
    embeddingProvider: "openai",
    embeddingModel: "text-embedding-3-small",
    openAIApiKey: process.env.OPENAI_API_KEY,
};

async function buildSelfGraph(): Promise<CodeGraph> {
    const graph = new CodeGraph();
    const srcDir = path.resolve(__dirname, "../../../../src");
    const files: string[] = [];

    function collectFiles(dir: string) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (!entry.name.includes("__tests__") && !entry.name.includes("node_modules")) {
                    collectFiles(fullPath);
                }
            } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts") && !entry.name.endsWith(".test.ts")) {
                files.push(fullPath);
            }
        }
    }
    collectFiles(srcDir);

    for (const filePath of files) {
        try {
            const result = await parseFile(filePath, srcDir);
            if (result && result.nodes) {
                for (const node of result.nodes) {
                    graph.addNode({ ...node, stale: false, last_indexed: new Date().toISOString() });
                }
                for (const edge of result.edges) {
                    graph.addEdge(edge);
                }
            }
        } catch { /* skip */ }
    }
    return graph;
}

describe("T18 — Semantic Query Expansion vs Ranking Injection", () => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        it.skip("OPENAI_API_KEY not set", () => { });
        return;
    }

    let graph: CodeGraph;
    let neuralVectors: Map<string, Float32Array>;

    it("builds self-index and embeds all nodes via OpenAI", async () => {
        graph = await buildSelfGraph();
        expect(graph.nodeCount()).toBeGreaterThan(100);

        const nodes = graph.nodes();
        const texts = nodes.map(nodeToEmbeddingText);

        const vectors = await embedTexts(texts, config);
        expect(vectors.length).toBe(nodes.length);

        neuralVectors = new Map();
        for (let i = 0; i < nodes.length; i++) {
            neuralVectors.set(nodes[i].id, vectors[i]);
        }
    }, 60_000);

    it("evaluates Ranking Injection vs Query Expansion on all queries", async () => {
        expect(graph).toBeDefined();
        expect(neuralVectors.size).toBeGreaterThan(0);

        const results: Array<{
            query: string;
            category: string;
            rankR10: number; expR10: number;
            rankMRR: number; expMRR: number;
            delta: number;
            expandedQuery: string;
        }> = [];

        for (const q of allQueries) {
            const queryVec = await embedSingle(q.query, config);
            expect(queryVec).not.toBeNull();

            // 1. Ranking Injection (T16 approach)
            // Baseline structural + direct dense search -> RRF fusion
            const structuralBase = structuralSearch(q.query, graph, 2, 20);
            const neural = neuralSearch(queryVec!, graph.nodes(), neuralVectors, 20);
            const rankFused = reciprocalRankFusion(structuralBase, neural, graph, 60, 20);
            const rankIds = rankFused.map((r) => r.id);

            // 2. Query Expansion (T18 approach)
            // Expand query using dense nearest neighbors, then run standard sparse pipelines
            const expandedStr = expandQuerySemantically(q.query, queryVec!, graph.nodes(), neuralVectors, 3);
            const structuralExp = structuralSearch(expandedStr, graph, 2, 20);
            const semanticExp = semanticSearch(expandedStr, graph.nodes(), 20);
            const expFused = reciprocalRankFusion(structuralExp, semanticExp, graph, 60, 20);
            const expIds = expFused.map((r) => r.id);

            results.push({
                query: q.query,
                category: q.category,
                rankR10: recallAtK(rankIds, q.expectedSymbols, 10),
                expR10: recallAtK(expIds, q.expectedSymbols, 10),
                rankMRR: computeMRR(rankIds, q.expectedSymbols),
                expMRR: computeMRR(expIds, q.expectedSymbols),
                delta: recallAtK(expIds, q.expectedSymbols, 10) - recallAtK(rankIds, q.expectedSymbols, 10),
                expandedQuery: expandedStr === q.query ? "(no change)" : expandedStr.replace(q.query, "").trim()
            });
        }

        console.log(`\n  ╔══════════════════════════════════════════════════════════════════╗`);
        console.log(`  ║  RANKING INJECTION vs SEMANTIC QUERY EXPANSION                ║`);
        console.log(`  ╚══════════════════════════════════════════════════════════════════╝\n`);

        for (const r of results) {
            if (r.delta !== 0) {
                const icon = r.delta > 0.01 ? "▲" : "▼";
                const deltaStr = r.delta > 0 ? `+${r.delta.toFixed(2)}` : r.delta.toFixed(2);
                console.log(`  ${icon} [${deltaStr}] R@10: ${r.rankR10.toFixed(2)}→${r.expR10.toFixed(2)} | ${r.query}`);
                if (r.delta > 0) {
                    console.log(`     Injected terms: ${r.expandedQuery}`);
                }
            }
        }

        // ─── Aggregates ───
        const categories = ["identifier", "natural", "cross-cutting"];
        console.log(`\n  ═══ AGGREGATE ═══\n`);
        console.log(`  ${"Category".padEnd(16)} ${"Rank R@10".padEnd(12)} ${"Exp R@10".padEnd(14)} ${"Δ R@10".padEnd(10)} ${"Rank MRR".padEnd(12)} ${"Exp MRR"}`);
        console.log(`  ${"─".repeat(76)}`);

        for (const cat of categories) {
            const cr = results.filter((r) => r.category === cat);
            const n = cr.length || 1;
            const bR = cr.reduce((s, r) => s + r.rankR10, 0) / n;
            const nR = cr.reduce((s, r) => s + r.expR10, 0) / n;
            const bM = cr.reduce((s, r) => s + r.rankMRR, 0) / n;
            const nM = cr.reduce((s, r) => s + r.expMRR, 0) / n;
            console.log(`  ${cat.padEnd(16)} ${bR.toFixed(3).padEnd(12)} ${nR.toFixed(3).padEnd(14)} ${((nR - bR) >= 0 ? "+" : "") + (nR - bR).toFixed(3).padEnd(10)} ${bM.toFixed(3).padEnd(12)} ${nM.toFixed(3)}`);
        }

        const N = results.length;
        const oB = results.reduce((s, r) => s + r.rankR10, 0) / N;
        const oN = results.reduce((s, r) => s + r.expR10, 0) / N;
        const oBM = results.reduce((s, r) => s + r.rankMRR, 0) / N;
        const oNM = results.reduce((s, r) => s + r.expMRR, 0) / N;
        console.log(`  ${"─".repeat(76)}`);
        console.log(`  ${"OVERALL".padEnd(16)} ${oB.toFixed(3).padEnd(12)} ${oN.toFixed(3).padEnd(14)} ${((oN - oB) >= 0 ? "+" : "") + (oN - oB).toFixed(3).padEnd(10)} ${oBM.toFixed(3).padEnd(12)} ${oNM.toFixed(3)}`);

        // The test completes successfully
        expect(results.length).toBe(45);
    }, 120_000);
});
