import { describe, it, expect } from "vitest";
import {
    isRelevant,
    recallAtK,
    precisionAtK,
    mrr,
    classifyFailure,
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

// ────────── Relevance Matching ──────────

describe("T14b — isRelevant (strict matching)", () => {
    it("exact match", () => {
        expect(isRelevant("auth.ts", "auth.ts")).toBe(true);
    });

    it("case-insensitive match", () => {
        expect(isRelevant("AuthService", "authservice")).toBe(true);
    });

    it("segment match: symbol in ID path", () => {
        expect(isRelevant("src/core/config/index.ts::loadConfig", "loadConfig")).toBe(true);
    });

    it("segment match: file path ending", () => {
        expect(isRelevant("src/core/config/index.ts", "config/index.ts")).toBe(true);
    });

    it("REJECTS partial substring: AuthServiceHelper ≠ AuthService", () => {
        // "AuthServiceHelper" segments: ["authservicehelper"]
        // "AuthService" segments: ["authservice"]
        // These are NOT equal segments
        expect(isRelevant("AuthServiceHelper", "AuthService")).toBe(false);
    });

    it("REJECTS unrelated strings", () => {
        expect(isRelevant("database.ts", "auth.ts")).toBe(false);
    });

    it("matches file-level segment", () => {
        expect(isRelevant("src/core/parser/typescript.ts", "typescript.ts")).toBe(true);
    });
});

// ────────── IR Metric Unit Tests ──────────

describe("T14b — IR Metrics (strict)", () => {
    it("recallAtK: perfect recall with exact matches", () => {
        expect(recallAtK(["auth.ts", "user.ts"], ["auth.ts", "user.ts"], 5)).toBe(1);
    });

    it("recallAtK: partial recall", () => {
        expect(recallAtK(["auth.ts", "x.ts"], ["auth.ts", "user.ts"], 5)).toBe(0.5);
    });

    it("recallAtK: zero recall", () => {
        expect(recallAtK(["x.ts", "y.ts"], ["auth.ts", "user.ts"], 5)).toBe(0);
    });

    it("recallAtK: respects K limit", () => {
        expect(recallAtK(["x.ts", "y.ts", "auth.ts"], ["auth.ts"], 2)).toBe(0);
        expect(recallAtK(["x.ts", "y.ts", "auth.ts"], ["auth.ts"], 3)).toBe(1);
    });

    it("recallAtK: segment match works", () => {
        expect(recallAtK(["src/core/config/index.ts"], ["config/index.ts"], 5)).toBe(1);
    });

    it("precisionAtK: all relevant", () => {
        expect(precisionAtK(["auth.ts", "user.ts"], ["auth.ts", "user.ts"], 2)).toBe(1);
    });

    it("precisionAtK: half relevant", () => {
        expect(precisionAtK(["auth.ts", "x.ts"], ["auth.ts"], 2)).toBe(0.5);
    });

    it("mrr: first result relevant", () => {
        expect(mrr(["auth.ts", "user.ts"], ["auth.ts"])).toBe(1);
    });

    it("mrr: second result relevant", () => {
        expect(mrr(["x.ts", "auth.ts"], ["auth.ts"])).toBe(0.5);
    });

    it("mrr: no relevant results", () => {
        expect(mrr(["x.ts", "y.ts"], ["auth.ts"])).toBe(0);
    });
});

// ────────── Failure Classification ──────────

describe("T14b — Failure Classification", () => {
    it("classifies synonym mismatch when query words ≠ expected identifiers", () => {
        const result = classifyFailure(
            "Where is authentication handled?",
            ["database.ts", "utils.ts"], // no auth-related results
            ["AuthService", "verifyJWT"]
        );
        expect(result).toBe("synonym");
    });

    it("classifies structural when expected spans many paths", () => {
        const result = classifyFailure(
            "How do CLI commands interact with the graph?",
            ["unrelated.ts"],
            ["cli/index.ts", "commands/index.ts", "graph/index.ts"]
        );
        expect(result).toBe("structural");
    });

    it("classifies none when recall is sufficient", () => {
        const result = classifyFailure(
            "loadConfig",
            ["config/index.ts", "loadConfig"],
            ["config/index.ts", "loadConfig"]
        );
        expect(result).toBe("none");
    });
});

// ────────── Self-Index Benchmark ──────────

describe("T14b — Self-Index Benchmark", () => {
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

    let graph: CodeGraph;

    it("builds self-index graph", async () => {
        graph = await buildSelfGraph();
        expect(graph.nodeCount()).toBeGreaterThan(100);
        console.log(`  Self-index: ${graph.nodeCount()} nodes, ${graph.edgeCount()} edges`);
    });

    it("identifier queries with strict matching", () => {
        expect(graph).toBeDefined();
        const queries: BenchmarkQuery[] = [
            { query: "parseTypeScript", repo: "self", expectedSymbols: ["typescript.ts"], category: "identifier" },
            { query: "CodeGraph addNode", repo: "self", expectedSymbols: ["graph/index.ts", "CodeGraph"], category: "identifier" },
            { query: "loadConfig", repo: "self", expectedSymbols: ["config/index.ts", "loadConfig"], category: "identifier" },
        ];

        const report = runBenchmark(queries, graph, "weighted-bfs");
        console.log(`  Identifier: R@10=${report.avgRecallAt10} MRR=${report.avgMRR} ` +
            `${report.avgLatencyMs}ms  expanded=${report.avgNodesExpanded}/${report.graphSize} ` +
            `(${(report.expansionRatio * 100).toFixed(1)}%)`);
        expect(report.avgRecallAt10).toBeGreaterThan(0);
    });

    it("NL queries with failure analysis", () => {
        expect(graph).toBeDefined();
        const queries: BenchmarkQuery[] = [
            { query: "How does code parsing work?", repo: "self", expectedSymbols: ["parser", "typescript.ts"], category: "natural" },
            { query: "Where is configuration loaded?", repo: "self", expectedSymbols: ["config", "loadConfig"], category: "natural" },
            { query: "How are embeddings created?", repo: "self", expectedSymbols: ["embedding/index.ts", "embedDocuments"], category: "natural" },
            { query: "How does staleness propagation work?", repo: "self", expectedSymbols: ["graph/index.ts", "markStale"], category: "natural" },
            { query: "How does the search pipeline work?", repo: "self", expectedSymbols: ["retrieval/index.ts", "hybridRetrieve"], category: "natural" },
        ];

        const report = runBenchmark(queries, graph, "weighted-bfs");
        console.log(`  NL: R@10=${report.avgRecallAt10} MRR=${report.avgMRR} ${report.avgLatencyMs}ms`);
        console.log(`  Failures: synonym=${report.failureSummary.synonym} concept=${report.failureSummary.concept} ` +
            `structural=${report.failureSummary.structural} none=${report.failureSummary.none}`);
    });

    it("prints full formatted report with expansion ratio and failure analysis", () => {
        expect(graph).toBeDefined();
        const queries: BenchmarkQuery[] = [
            { query: "parseTypeScript", repo: "self", expectedSymbols: ["typescript.ts"], category: "identifier" },
            { query: "loadConfig", repo: "self", expectedSymbols: ["config"], category: "identifier" },
            { query: "How does parsing work?", repo: "self", expectedSymbols: ["parser"], category: "natural" },
            { query: "Where is the graph stored?", repo: "self", expectedSymbols: ["storage", "graph"], category: "natural" },
        ];

        const report = runBenchmark(queries, graph, "weighted-bfs");
        const formatted = formatReport(report);
        console.log(formatted);
        expect(formatted).toContain("Expansion Ratio");
        expect(formatted).toContain("Failure Analysis");
        expect(formatted).toContain("Graph Size");
    });
});

// ────────── Scalability Ladder ──────────

describe("T14b — Scalability Ladder", () => {
    function buildSyntheticGraph(nodeCount: number): CodeGraph {
        const graph = new CodeGraph();
        for (let i = 0; i < nodeCount; i++) {
            graph.addNode(makeNode(
                `module${i}.ts`,
                `module${i}.ts`,
                "file",
                { summary: `Module ${i} handles feature ${i % 50}`, tags: [`tag${i % 20}`] }
            ));
        }
        for (let i = 0; i < nodeCount; i++) {
            const target = (i + 1 + Math.floor(Math.random() * 10)) % nodeCount;
            graph.addEdge({
                source: `module${i}.ts`,
                target: `module${target}.ts`,
                type: i % 3 === 0 ? "imports" : i % 3 === 1 ? "calls" : "contains",
                via: "",
            });
        }
        return graph;
    }

    const sizes = [2000, 5000, 10000];
    for (const size of sizes) {
        it(`${size} nodes`, () => {
            const graph = buildSyntheticGraph(size);
            const t0 = performance.now();
            const result = profiledSearch("module42", graph, 20);
            const elapsed = performance.now() - t0;

            console.log(`  ${(size / 1000).toFixed(0)}k nodes: ${Math.round(elapsed)}ms total, ` +
                `${result.latency.nodesExpanded} expanded (${(result.latency.nodesExpanded / size * 100).toFixed(2)}%)`);
            expect(result.results.length).toBeGreaterThan(0);
        });
    }
});

// ────────── Latency Profiling ──────────

describe("T14b — Latency Profiling", () => {
    it("profiledSearch returns latency breakdown", () => {
        const graph = new CodeGraph();
        graph.addNode(makeNode("a.ts", "auth", "file", { summary: "auth service" }));
        graph.addNode(makeNode("b.ts", "db", "file", { summary: "database" }));
        graph.addEdge({ source: "a.ts", target: "b.ts", type: "imports", via: "" });

        const result = profiledSearch("auth", graph);
        expect(result.latency.total_ms).toBeGreaterThanOrEqual(0);
        expect(result.latency.graph_ms).toBeGreaterThanOrEqual(0);
        expect(result.results.length).toBeGreaterThan(0);
    });
});
