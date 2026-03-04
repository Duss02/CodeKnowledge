/**
 * T16 — Embedding Improvement Benchmark
 *
 * Compares retrieval quality before/after enriched embeddings.
 *
 * Architecture: enriched embeddings REPLACE TF-IDF as the semantic signal.
 *   Baseline:  RRF(structural, tfidf)
 *   Enriched:  RRF(structural, enriched)
 *
 * This is the correct fusion strategy — adding a 3rd equal-weight
 * signal dilutes the structural signal that already works well.
 */
import { describe, it, expect } from "vitest";
import { CodeGraph } from "../../graph/index.js";
import { parseFile } from "../../parser/index.js";
import {
    generateEnrichedEmbeddings,
    embedEnrichedQuery,
} from "../../embedding/enriched.js";
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
    type BenchmarkQuery,
} from "../benchmark.js";
import path from "path";
import fs from "fs";

const queriesPath = path.resolve(__dirname, "queries.json");
const allQueries: BenchmarkQuery[] = JSON.parse(fs.readFileSync(queriesPath, "utf-8"));

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

describe("T16 — Embedding Improvement Benchmark", () => {
    let graph: CodeGraph;
    let enrichedVocab: ReturnType<typeof generateEnrichedEmbeddings>["vocab"];
    let enrichedVectors: Map<string, Float32Array>;

    it("builds self-index and generates enriched embeddings", async () => {
        graph = await buildSelfGraph();
        expect(graph.nodeCount()).toBeGreaterThan(100);

        const { vocab, vectors } = generateEnrichedEmbeddings(graph.nodes());
        enrichedVocab = vocab;
        enrichedVectors = vectors;

        console.log(`  Self-index: ${graph.nodeCount()} nodes`);
        console.log(`  Enriched embeddings: ${vectors.size} vectors`);
        console.log(`  Vocabulary size: ${vocab.termIndex.size} terms`);
    });

    it("baseline vs enriched: RRF(structural, tfidf) vs RRF(structural, enriched)", () => {
        expect(graph).toBeDefined();
        expect(enrichedVectors.size).toBeGreaterThan(0);

        const results: Array<{
            query: string;
            category: string;
            baseR10: number;
            enrichR10: number;
            baseMRR: number;
            enrichMRR: number;
            delta: number;
            baseFail: string;
            enrichFail: string;
        }> = [];

        for (const q of allQueries) {
            // Baseline: RRF(structural, tfidf)
            const structural = structuralSearch(q.query, graph, 2, 20);
            const tfidf = semanticSearch(q.query, graph.nodes(), 20);
            const baseFused = reciprocalRankFusion(structural, tfidf, graph, 60, 20);
            const baseIds = baseFused.map((r) => r.id);

            // Enriched: RRF(structural, enriched) — enriched REPLACES tfidf
            const queryVec = embedEnrichedQuery(q.query, enrichedVocab);
            const enriched = neuralSearch(queryVec, graph.nodes(), enrichedVectors, 20);
            const enrichFused = reciprocalRankFusion(structural, enriched, graph, 60, 20);
            const enrichIds = enrichFused.map((r) => r.id);

            const baseR10 = recallAtK(baseIds, q.expectedSymbols, 10);
            const enrichR10 = recallAtK(enrichIds, q.expectedSymbols, 10);
            const baseMRR = computeMRR(baseIds, q.expectedSymbols);
            const enrichMRR = computeMRR(enrichIds, q.expectedSymbols);

            results.push({
                query: q.query,
                category: q.category,
                baseR10, enrichR10,
                baseMRR, enrichMRR,
                delta: enrichR10 - baseR10,
                baseFail: classifyFailure(q.query, baseIds, q.expectedSymbols),
                enrichFail: classifyFailure(q.query, enrichIds, q.expectedSymbols),
            });
        }

        // ─── Per-query changes ───
        console.log(`\n  ╔══════════════════════════════════════════════════════════════════╗`);
        console.log(`  ║  RRF(structural, tfidf) vs RRF(structural, enriched)          ║`);
        console.log(`  ╚══════════════════════════════════════════════════════════════════╝\n`);

        let improved = 0, degraded = 0, unchanged = 0;
        let fixedSynonymCount = 0;

        for (const r of results) {
            if (r.delta > 0.01) improved++;
            else if (r.delta < -0.01) degraded++;
            else unchanged++;

            if (r.baseFail === "synonym" && r.enrichFail === "none") fixedSynonymCount++;

            if (r.delta !== 0) {
                const icon = r.delta > 0 ? "▲" : "▼";
                const deltaStr = r.delta > 0 ? `+${r.delta.toFixed(2)}` : r.delta.toFixed(2);
                console.log(`  ${icon} [${deltaStr}] R@10: ${r.baseR10.toFixed(2)}→${r.enrichR10.toFixed(2)} | ${r.query}`);
                if (r.baseFail !== "none" && r.enrichFail === "none") {
                    console.log(`     ✓ FIXED: ${r.baseFail} → success`);
                }
            }
        }

        // ─── Aggregates ───
        const categories = ["identifier", "natural", "cross-cutting"];
        console.log(`\n  ═══ AGGREGATE ═══\n`);
        console.log(`  ${"Category".padEnd(16)} ${"Base R@10".padEnd(12)} ${"Enrich R@10".padEnd(14)} ${"Δ R@10".padEnd(10)} ${"Base MRR".padEnd(12)} ${"Enrich MRR"}`);
        console.log(`  ${"─".repeat(76)}`);

        for (const cat of categories) {
            const cr = results.filter((r) => r.category === cat);
            const n = cr.length || 1;
            const bR = cr.reduce((s, r) => s + r.baseR10, 0) / n;
            const eR = cr.reduce((s, r) => s + r.enrichR10, 0) / n;
            const bM = cr.reduce((s, r) => s + r.baseMRR, 0) / n;
            const eM = cr.reduce((s, r) => s + r.enrichMRR, 0) / n;
            console.log(`  ${cat.padEnd(16)} ${bR.toFixed(3).padEnd(12)} ${eR.toFixed(3).padEnd(14)} ${((eR - bR) >= 0 ? "+" : "") + (eR - bR).toFixed(3).padEnd(10)} ${bM.toFixed(3).padEnd(12)} ${eM.toFixed(3)}`);
        }

        const N = results.length;
        const oB = results.reduce((s, r) => s + r.baseR10, 0) / N;
        const oE = results.reduce((s, r) => s + r.enrichR10, 0) / N;
        const oBM = results.reduce((s, r) => s + r.baseMRR, 0) / N;
        const oEM = results.reduce((s, r) => s + r.enrichMRR, 0) / N;
        console.log(`  ${"─".repeat(76)}`);
        console.log(`  ${"OVERALL".padEnd(16)} ${oB.toFixed(3).padEnd(12)} ${oE.toFixed(3).padEnd(14)} ${((oE - oB) >= 0 ? "+" : "") + (oE - oB).toFixed(3).padEnd(10)} ${oBM.toFixed(3).padEnd(12)} ${oEM.toFixed(3)}`);

        console.log(`\n  Queries: Improved=${improved}  Unchanged=${unchanged}  Degraded=${degraded}`);

        const baseSyn = results.filter((r) => r.baseFail === "synonym").length;
        const enrichSyn = results.filter((r) => r.enrichFail === "synonym").length;
        console.log(`  Synonym failures: ${baseSyn} → ${enrichSyn} (fixed ${fixedSynonymCount})`);
        console.log(`\n  Overall Recall@10: ${oB.toFixed(3)} → ${oE.toFixed(3)} (Δ ${((oE - oB) >= 0 ? "+" : "") + (oE - oB).toFixed(3)})`);

        // The test records results — it doesn't require improvement (diagnostic)
        expect(results.length).toBe(45);
    });
});
