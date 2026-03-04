import { describe, it, expect } from "vitest";
import {
    recallAtK,
    precisionAtK,
    mrr,
    profiledSearch,
    runBenchmark,
    formatReport,
    type BenchmarkQuery,
} from "../benchmark.js";
import { CodeGraph } from "../../graph/index.js";
import type { GraphNode } from "../../graph/index.js";
import { parseFile } from "../../parser/index.js";
import path from "path";
import fs from "fs";

function makeNode(id: string, name: string, type: GraphNode["type"] = "file", extras: Partial<GraphNode> = {}): GraphNode {
    return {
        id, type, language: "typescript", path: id, name,
        lines: [1, 10] as [number, number], hash: `h-${id}`,
        exports: [], stale: false, last_indexed: new Date().toISOString(),
        ...extras,
    };
}

// ────────── IR Metric Unit Tests ──────────

describe("T14 — IR Metrics", () => {
    it("recallAtK: perfect recall", () => {
        expect(recallAtK(["a.ts", "b.ts", "c.ts"], ["a.ts", "b.ts"], 5)).toBe(1);
    });

    it("recallAtK: partial recall", () => {
        expect(recallAtK(["a.ts", "x.ts"], ["a.ts", "b.ts"], 5)).toBe(0.5);
    });

    it("recallAtK: zero recall", () => {
        expect(recallAtK(["x.ts", "y.ts"], ["a.ts", "b.ts"], 5)).toBe(0);
    });

    it("recallAtK: respects K limit", () => {
        expect(recallAtK(["x.ts", "y.ts", "a.ts"], ["a.ts"], 2)).toBe(0);
        expect(recallAtK(["x.ts", "y.ts", "a.ts"], ["a.ts"], 3)).toBe(1);
    });

    it("recallAtK: fuzzy matching (substring)", () => {
        expect(recallAtK(["auth.ts", "db.ts"], ["auth"], 5)).toBe(1);
    });

    it("precisionAtK: all relevant", () => {
        expect(precisionAtK(["a.ts", "b.ts"], ["a.ts", "b.ts"], 2)).toBe(1);
    });

    it("precisionAtK: half relevant", () => {
        expect(precisionAtK(["a.ts", "x.ts"], ["a.ts", "b.ts"], 2)).toBe(0.5);
    });

    it("mrr: first result is relevant", () => {
        expect(mrr(["a.ts", "b.ts"], ["a.ts"])).toBe(1);
    });

    it("mrr: second result is relevant", () => {
        expect(mrr(["x.ts", "a.ts", "b.ts"], ["a.ts"])).toBe(0.5);
    });

    it("mrr: no relevant results", () => {
        expect(mrr(["x.ts", "y.ts"], ["a.ts"])).toBe(0);
    });
});

// ────────── Self-Index Benchmark ──────────

describe("T14 — Self-Index Benchmark", () => {
    // Build graph from CK source (async because parseFile is async)
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
            } catch {
                // skip files that fail to parse
            }
        }
        return graph;
    }

    let graph: CodeGraph;

    it("builds self-index graph", async () => {
        graph = await buildSelfGraph();
        expect(graph.nodeCount()).toBeGreaterThan(100);
        console.log(`  Self-index: ${graph.nodeCount()} nodes, ${graph.edgeCount()} edges`);
    });

    it("identifier queries achieve Recall@10 > 0", () => {
        expect(graph).toBeDefined();
        const queries: BenchmarkQuery[] = [
            { query: "parseTypeScript", repo: "self", expectedSymbols: ["typescript.ts", "parseTypeScript"], category: "identifier" },
            { query: "CodeGraph addNode", repo: "self", expectedSymbols: ["graph/index.ts", "CodeGraph"], category: "identifier" },
            { query: "loadConfig", repo: "self", expectedSymbols: ["config/index.ts", "loadConfig"], category: "identifier" },
        ];

        const report = runBenchmark(queries, graph, "weighted-bfs");
        console.log(`  Identifier queries: R@10=${report.avgRecallAt10} MRR=${report.avgMRR} Latency=${report.avgLatencyMs}ms`);
        expect(report.avgRecallAt10).toBeGreaterThan(0);
    });

    it("natural language queries return results", () => {
        expect(graph).toBeDefined();
        const queries: BenchmarkQuery[] = [
            { query: "How does code parsing work?", repo: "self", expectedSymbols: ["parser", "typescript.ts"], category: "natural" },
            { query: "Where is configuration loaded?", repo: "self", expectedSymbols: ["config", "loadConfig"], category: "natural" },
        ];

        const report = runBenchmark(queries, graph, "weighted-bfs");
        console.log(`  NL queries: R@10=${report.avgRecallAt10} MRR=${report.avgMRR} Latency=${report.avgLatencyMs}ms`);
        expect(report.queries.every((q) => q.retrievedIds.length > 0)).toBe(true);
    });

    it("all queries complete in <200ms each", () => {
        expect(graph).toBeDefined();
        const queries: BenchmarkQuery[] = [
            { query: "parseTypeScript", repo: "self", expectedSymbols: ["typescript.ts"], category: "identifier" },
            { query: "How does the graph work?", repo: "self", expectedSymbols: ["graph"], category: "natural" },
        ];

        const report = runBenchmark(queries, graph, "weighted-bfs");
        expect(report.p95LatencyMs).toBeLessThan(200);
    });

    it("prints formatted report", () => {
        expect(graph).toBeDefined();
        const queries: BenchmarkQuery[] = [
            { query: "parseTypeScript", repo: "self", expectedSymbols: ["typescript.ts"], category: "identifier" },
            { query: "loadConfig", repo: "self", expectedSymbols: ["config"], category: "identifier" },
            { query: "How does parsing work?", repo: "self", expectedSymbols: ["parser"], category: "natural" },
        ];

        const report = runBenchmark(queries, graph, "weighted-bfs");
        const formatted = formatReport(report);
        console.log(formatted);
        expect(formatted).toContain("Retrieval Benchmark");
        expect(formatted).toContain("Recall@10");
    });
});

// ────────── Latency Profiling ──────────

describe("T14 — Latency Profiling", () => {
    it("profiledSearch returns latency breakdown", () => {
        const graph = new CodeGraph();
        graph.addNode(makeNode("a.ts", "auth", "file", { summary: "auth service" }));
        graph.addNode(makeNode("b.ts", "db", "file", { summary: "database" }));
        graph.addEdge({ source: "a.ts", target: "b.ts", type: "imports", via: "" });

        const result = profiledSearch("auth", graph);
        expect(result.latency.total_ms).toBeGreaterThanOrEqual(0);
        expect(result.latency.graph_ms).toBeGreaterThanOrEqual(0);
        expect(result.latency.semantic_ms).toBeGreaterThanOrEqual(0);
        // At least the direct match should be found
        expect(result.results.length).toBeGreaterThan(0);
    });
});

// ────────── Scalability ──────────

describe("T14 — Scalability", () => {
    it("handles 2000-node graph query in reasonable time", () => {
        const graph = new CodeGraph();
        for (let i = 0; i < 2000; i++) {
            graph.addNode(makeNode(
                `module${i}.ts`,
                `module${i}.ts`,
                "file",
                { summary: `Module ${i} handles feature ${i % 50}`, tags: [`tag${i % 20}`] }
            ));
        }
        for (let i = 0; i < 2000; i++) {
            const target = (i + 1 + Math.floor(Math.random() * 10)) % 2000;
            graph.addEdge({
                source: `module${i}.ts`,
                target: `module${target}.ts`,
                type: i % 3 === 0 ? "imports" : i % 3 === 1 ? "calls" : "contains",
                via: "",
            });
        }

        const t0 = performance.now();
        const result = profiledSearch("module42", graph, 20);
        const elapsed = performance.now() - t0;

        console.log(`  2k nodes: ${Math.round(elapsed)}ms total, ${result.latency.nodesExpanded} expanded`);
        expect(elapsed).toBeLessThan(2000);
        expect(result.results.length).toBeGreaterThan(0);
    });
});
