/**
 * T16b — Real Neural Embedding Benchmark (OpenAI text-embedding-3-small)
 *
 * Calls the OpenAI API to generate dense 1536-dim embeddings for all
 * self-index nodes, then compares:
 *   Baseline:  RRF(structural, tfidf)
 *   Neural:    RRF(structural, neural)
 *
 * This is the definitive test of whether neural embeddings fix
 * the 88% synonym mismatch failures identified in T15.
 */
import { describe, it, expect } from "vitest";
import { CodeGraph } from "../../graph/index.js";
import type { GraphNode } from "../../graph/index.js";
import { parseFile } from "../../parser/index.js";
import { embedTexts, embedSingle, nodeToEmbeddingText } from "../../embedding/neural.js";
import {
    structuralSearch,
    semanticSearch,
    neuralSearch,
    reciprocalRankFusion,
} from "../index.js";
import {
    recallAtK,
    mrr as computeMRR,
    classifyFailure,
    isRelevant,
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

describe("T16b — Real Neural Embedding Benchmark", () => {
    // Skip if no API key
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

        console.log(`  Graph: ${nodes.length} nodes`);
        console.log(`  Embedding ${texts.length} texts via text-embedding-3-small...`);

        const t0 = performance.now();
        const vectors = await embedTexts(texts, config);
        const elapsed = performance.now() - t0;

        console.log(`  Embedded in ${Math.round(elapsed)}ms (${(elapsed / texts.length).toFixed(1)}ms/node)`);
        console.log(`  Vector dim: ${vectors[0]?.length || 0}`);

        expect(vectors.length).toBe(nodes.length);

        neuralVectors = new Map();
        for (let i = 0; i < nodes.length; i++) {
            neuralVectors.set(nodes[i].id, vectors[i]);
        }
    }, 60_000); // 60s timeout for API calls

    it("A/B: RRF(structural, tfidf) vs RRF(structural, neural) on all 45 queries", async () => {
        expect(graph).toBeDefined();
        expect(neuralVectors.size).toBeGreaterThan(0);

        const results: Array<{
            query: string;
            category: string;
            baseR10: number; neuralR10: number;
            baseMRR: number; neuralMRR: number;
            delta: number;
            baseFail: string; neuralFail: string;
        }> = [];

        for (const q of allQueries) {
            // Baseline: RRF(structural, tfidf)
            const structural = structuralSearch(q.query, graph, 2, 20);
            const tfidf = semanticSearch(q.query, graph.nodes(), 20);
            const baseFused = reciprocalRankFusion(structural, tfidf, graph, 60, 20);
            const baseIds = baseFused.map((r) => r.id);

            // Neural: RRF(structural, neural)
            const queryVec = await embedSingle(q.query, config);
            expect(queryVec).not.toBeNull();
            const neural = neuralSearch(queryVec!, graph.nodes(), neuralVectors, 20);
            const neuralFused = reciprocalRankFusion(structural, neural, graph, 60, 20);
            const neuralIds = neuralFused.map((r) => r.id);

            const baseR10 = recallAtK(baseIds, q.expectedSymbols, 10);
            const neuralR10 = recallAtK(neuralIds, q.expectedSymbols, 10);

            results.push({
                query: q.query,
                category: q.category,
                baseR10, neuralR10,
                baseMRR: computeMRR(baseIds, q.expectedSymbols),
                neuralMRR: computeMRR(neuralIds, q.expectedSymbols),
                delta: neuralR10 - baseR10,
                baseFail: classifyFailure(q.query, baseIds, q.expectedSymbols),
                neuralFail: classifyFailure(q.query, neuralIds, q.expectedSymbols),
            });
        }

        // ─── Per-query changes ───
        console.log(`\n  ╔══════════════════════════════════════════════════════════════════╗`);
        console.log(`  ║  TF-IDF BASELINE vs NEURAL (text-embedding-3-small)           ║`);
        console.log(`  ╚══════════════════════════════════════════════════════════════════╝\n`);

        let improved = 0, degraded = 0, unchanged = 0;
        let fixedSynonym = 0;

        for (const r of results) {
            if (r.delta > 0.01) improved++;
            else if (r.delta < -0.01) degraded++;
            else unchanged++;

            if (r.baseFail === "synonym" && r.neuralFail === "none") fixedSynonym++;

            const icon = r.delta > 0.01 ? "▲" : r.delta < -0.01 ? "▼" : "═";
            const deltaStr = r.delta > 0 ? `+${r.delta.toFixed(2)}` : r.delta === 0 ? " 0.00" : r.delta.toFixed(2);

            console.log(`  ${icon} [${deltaStr}] R@10: ${r.baseR10.toFixed(2)}→${r.neuralR10.toFixed(2)} | ${r.query}`);
            if (r.baseFail !== "none" && r.neuralFail === "none") {
                console.log(`     ✓ FIXED: ${r.baseFail} → success`);
            }
        }

        // ─── Aggregates ───
        const categories = ["identifier", "natural", "cross-cutting"];
        console.log(`\n  ═══ AGGREGATE ═══\n`);
        console.log(`  ${"Category".padEnd(16)} ${"Base R@10".padEnd(12)} ${"Neural R@10".padEnd(14)} ${"Δ R@10".padEnd(10)} ${"Base MRR".padEnd(12)} ${"Neural MRR"}`);
        console.log(`  ${"─".repeat(76)}`);

        for (const cat of categories) {
            const cr = results.filter((r) => r.category === cat);
            const n = cr.length || 1;
            const bR = cr.reduce((s, r) => s + r.baseR10, 0) / n;
            const nR = cr.reduce((s, r) => s + r.neuralR10, 0) / n;
            const bM = cr.reduce((s, r) => s + r.baseMRR, 0) / n;
            const nM = cr.reduce((s, r) => s + r.neuralMRR, 0) / n;
            console.log(`  ${cat.padEnd(16)} ${bR.toFixed(3).padEnd(12)} ${nR.toFixed(3).padEnd(14)} ${((nR - bR) >= 0 ? "+" : "") + (nR - bR).toFixed(3).padEnd(10)} ${bM.toFixed(3).padEnd(12)} ${nM.toFixed(3)}`);
        }

        const N = results.length;
        const oB = results.reduce((s, r) => s + r.baseR10, 0) / N;
        const oN = results.reduce((s, r) => s + r.neuralR10, 0) / N;
        const oBM = results.reduce((s, r) => s + r.baseMRR, 0) / N;
        const oNM = results.reduce((s, r) => s + r.neuralMRR, 0) / N;
        console.log(`  ${"─".repeat(76)}`);
        console.log(`  ${"OVERALL".padEnd(16)} ${oB.toFixed(3).padEnd(12)} ${oN.toFixed(3).padEnd(14)} ${((oN - oB) >= 0 ? "+" : "") + (oN - oB).toFixed(3).padEnd(10)} ${oBM.toFixed(3).padEnd(12)} ${oNM.toFixed(3)}`);

        console.log(`\n  Queries: Improved=${improved}  Unchanged=${unchanged}  Degraded=${degraded}`);

        const baseSyn = results.filter((r) => r.baseFail === "synonym").length;
        const neuralSyn = results.filter((r) => r.neuralFail === "synonym").length;
        console.log(`  Synonym failures: ${baseSyn} → ${neuralSyn} (fixed ${fixedSynonym})`);
        console.log(`\n  ══ VERDICT ══`);
        console.log(`  Overall Recall@10: ${oB.toFixed(3)} → ${oN.toFixed(3)} (Δ ${((oN - oB) >= 0 ? "+" : "") + (oN - oB).toFixed(3)})`);
        console.log(`  Overall MRR:       ${oBM.toFixed(3)} → ${oNM.toFixed(3)} (Δ ${((oNM - oBM) >= 0 ? "+" : "") + (oNM - oBM).toFixed(3)})`);

        if (oN > oB) {
            console.log(`  → NEURAL EMBEDDINGS IMPROVE RETRIEVAL ✓`);
        } else if (oN === oB) {
            console.log(`  → NEUTRAL — no improvement`);
        } else {
            console.log(`  → REGRESSION — neural embeddings decrease quality`);
        }

        expect(results.length).toBe(45);
    }, 120_000); // 120s for 45 API calls
});
