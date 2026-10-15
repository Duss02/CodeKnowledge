/**
 * T15 — Full NL Failure Analysis
 *
 * Runs all 45 queries from queries.json against the self-index
 * and outputs a detailed failure classification report.
 *
 * This is a diagnostic test — it prints analysis, not just pass/fail.
 */
import { describe, it, expect } from "vitest";
import {
    recallAtK,
    mrr,
    classifyFailure,
    runBenchmark,
    formatReport,
    type BenchmarkQuery,
} from "../benchmark.js";
import { CodeGraph } from "../../graph/index.js";
import { parseFile } from "../../parser/index.js";
import path from "path";
import fs from "fs";

// ──────────── Load queries ──────────

const queriesPath = path.resolve(__dirname, "queries.json");
const allQueries: BenchmarkQuery[] = JSON.parse(fs.readFileSync(queriesPath, "utf-8"));

// ──────────── Build self-index ──────────

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

// ──────────── Full analysis ──────────

describe("T15 — Full 45-Query NL Failure Analysis", () => {
    let graph: CodeGraph;

    it("builds self-index", async () => {
        graph = await buildSelfGraph();
        expect(graph.nodeCount()).toBeGreaterThan(100);
    });

    it("runs full benchmark and prints formatted report", () => {
        expect(graph).toBeDefined();

        const report = runBenchmark(allQueries, graph, "weighted-bfs");
        const formatted = formatReport(report);
        console.log(formatted);

        // Print aggregate
        console.log(`\n  ═══ AGGREGATE ═══`);
        console.log(`  Total queries:     ${report.totalQueries}`);
        console.log(`  Graph size:        ${report.graphSize} nodes`);
        console.log(`  Avg expansion:     ${report.avgNodesExpanded} (${(report.expansionRatio * 100).toFixed(1)}%)`);
    });

    it("per-query failure diagnosis for NL + cross-cutting queries", () => {
        expect(graph).toBeDefined();

        const nlQueries = allQueries.filter((q) => q.category !== "identifier");
        const report = runBenchmark(nlQueries, graph, "weighted-bfs");

        console.log(`\n  ═══ PER-QUERY NL FAILURE DIAGNOSIS ═══\n`);

        let synonymCount = 0;
        let conceptCount = 0;
        let structuralCount = 0;
        let successCount = 0;
        const failedQueries: string[] = [];

        for (const qr of report.queries) {
            const recall = qr.recallAt10;
            const status = recall >= 0.5 ? "✓" : "✗";
            const failureType = qr.failureType;

            if (failureType === "synonym") synonymCount++;
            else if (failureType === "concept") conceptCount++;
            else if (failureType === "structural") structuralCount++;
            else successCount++;

            // Print per-query detail
            const top3 = qr.retrievedIds.slice(0, 3).map((id) => {
                const basename = id.split("/").pop() || id;
                return basename.length > 30 ? basename.slice(0, 27) + "..." : basename;
            });

            console.log(`  ${status} [R@10=${recall.toFixed(2)}] [${failureType.padEnd(10)}] ${qr.query}`);
            if (recall < 0.5) {
                console.log(`     Expected: ${allQueries.find((q) => q.query === qr.query)?.expectedSymbols.join(", ")}`);
                console.log(`     Got:      ${top3.join(", ")}`);
                failedQueries.push(qr.query);
            }
        }

        const total = nlQueries.length;
        const failureTotal = synonymCount + conceptCount + structuralCount;
        console.log(`\n  ═══ FAILURE SUMMARY ═══`);
        console.log(`  Successful:     ${successCount}/${total} (${(successCount / total * 100).toFixed(0)}%)`);
        console.log(`  Synonym:        ${synonymCount}/${total} (${(synonymCount / total * 100).toFixed(0)}%)`);
        console.log(`  Concept:        ${conceptCount}/${total} (${(conceptCount / total * 100).toFixed(0)}%)`);
        console.log(`  Structural:     ${structuralCount}/${total} (${(structuralCount / total * 100).toFixed(0)}%)`);
        console.log(``);

        if (failureTotal > 0) {
            const synonymPct = synonymCount / failureTotal * 100;
            console.log(`  ═══ EMBEDDING DECISION ═══`);
            console.log(`  Synonym % of failures: ${synonymPct.toFixed(0)}%`);
            if (synonymPct >= 70) {
                console.log(`  → EMBEDDINGS JUSTIFIED: >70% of failures are synonym mismatch`);
                console.log(`  → Neural embeddings would directly address these failures`);
            } else if (synonymPct >= 40) {
                console.log(`  → EMBEDDINGS PARTIALLY JUSTIFIED: 40-70% synonym mismatch`);
                console.log(`  → Embeddings would help but won't solve all failures`);
            } else {
                console.log(`  → EMBEDDINGS NOT PRIMARY FIX: <40% synonym mismatch`);
                console.log(`  → Focus on structural graph improvements first`);
            }
        } else {
            console.log(`  → NO FAILURES DETECTED — current system handles all NL queries`);
        }
    });
});
