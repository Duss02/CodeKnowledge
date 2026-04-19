"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const index_js_1 = require("../index.js");
const index_js_2 = require("../../graph/index.js");
function makeNode(id, name, type = "file", extras = {}) {
    return {
        id, type, language: "typescript", path: id, name,
        lines: [1, 10], hash: `h-${id}`,
        exports: [], stale: false, last_indexed: new Date().toISOString(),
        ...extras,
    };
}
function buildTestGraph() {
    const graph = new index_js_2.CodeGraph();
    // auth.ts imports user.ts, user.ts imports db.ts
    graph.addNode(makeNode("auth.ts", "auth.ts", "file", { summary: "Authentication service with JWT login", exports: ["AuthService", "login"], tags: ["auth", "security"] }));
    graph.addNode(makeNode("user.ts", "user.ts", "file", { summary: "User management and profiles", exports: ["UserService", "getUser"], tags: ["user", "crud"] }));
    graph.addNode(makeNode("db.ts", "db.ts", "file", { summary: "Database connection pooling and queries", exports: ["Database", "query"], tags: ["database", "sql"] }));
    graph.addNode(makeNode("utils.ts", "utils.ts", "file", { summary: "Utility functions: formatDate, hashPassword", exports: ["formatDate", "hashPassword"], tags: ["utility"] }));
    graph.addNode(makeNode("config.ts", "config.ts", "file", { summary: "Application configuration loader", exports: ["loadConfig"], tags: ["config"] }));
    graph.addEdge({ source: "auth.ts", target: "user.ts", type: "imports", via: "UserService" });
    graph.addEdge({ source: "user.ts", target: "db.ts", type: "imports", via: "Database" });
    graph.addEdge({ source: "auth.ts", target: "utils.ts", type: "imports", via: "hashPassword" });
    graph.addEdge({ source: "auth.ts", target: "config.ts", type: "imports", via: "loadConfig" });
    return graph;
}
// ────────── Structural Search ──────────
(0, vitest_1.describe)("T8 — structuralSearch", () => {
    (0, vitest_1.it)("finds direct name matches", () => {
        const graph = buildTestGraph();
        const results = (0, index_js_1.structuralSearch)("auth", graph);
        (0, vitest_1.expect)(results[0].node.id).toBe("auth.ts");
        (0, vitest_1.expect)(results[0].hops).toBe(0);
        (0, vitest_1.expect)(results[0].score).toBeGreaterThan(0);
    });
    (0, vitest_1.it)("expands to neighbors via BFS", () => {
        const graph = buildTestGraph();
        const results = (0, index_js_1.structuralSearch)("auth", graph, 2);
        const ids = results.map((r) => r.node.id);
        (0, vitest_1.expect)(ids).toContain("auth.ts"); // direct match
        (0, vitest_1.expect)(ids).toContain("user.ts"); // 1-hop neighbor
        (0, vitest_1.expect)(ids).toContain("utils.ts"); // 1-hop neighbor
    });
    (0, vitest_1.it)("hop 2 reaches db.ts through auth→user→db", () => {
        const graph = buildTestGraph();
        const results = (0, index_js_1.structuralSearch)("auth", graph, 2);
        const dbResult = results.find((r) => r.node.id === "db.ts");
        (0, vitest_1.expect)(dbResult).toBeDefined();
        (0, vitest_1.expect)(dbResult.hops).toBe(2);
    });
    (0, vitest_1.it)("returns empty for no matches", () => {
        const graph = buildTestGraph();
        const results = (0, index_js_1.structuralSearch)("nonexistent_module_xyz", graph);
        (0, vitest_1.expect)(results).toHaveLength(0);
    });
});
// ────────── Semantic Search ──────────
(0, vitest_1.describe)("T8 — semanticSearch", () => {
    (0, vitest_1.it)("ranks auth-related nodes highest for auth query", () => {
        const graph = buildTestGraph();
        const results = (0, index_js_1.semanticSearch)("authentication login jwt security", graph.nodes());
        (0, vitest_1.expect)(results[0].id).toBe("auth.ts");
    });
    (0, vitest_1.it)("ranks db-related nodes highest for database query", () => {
        const graph = buildTestGraph();
        const results = (0, index_js_1.semanticSearch)("database sql connection pool", graph.nodes());
        (0, vitest_1.expect)(results[0].id).toBe("db.ts");
    });
});
// ────────── RRF Fusion ──────────
(0, vitest_1.describe)("T8 — reciprocalRankFusion", () => {
    (0, vitest_1.it)("merges structural and semantic results", () => {
        const graph = buildTestGraph();
        const structural = (0, index_js_1.structuralSearch)("auth", graph, 2);
        const semantic = (0, index_js_1.semanticSearch)("authentication login", graph.nodes());
        const fused = (0, index_js_1.reciprocalRankFusion)(structural, semantic, graph);
        (0, vitest_1.expect)(fused.length).toBeGreaterThan(0);
        // auth.ts should appear in top results (strong in both)
        (0, vitest_1.expect)(fused[0].id).toBe("auth.ts");
        (0, vitest_1.expect)(fused[0].fusedScore).toBeGreaterThan(0);
    });
    (0, vitest_1.it)("includes nodes from both sources", () => {
        const graph = buildTestGraph();
        const structural = (0, index_js_1.structuralSearch)("auth", graph, 1); // auth + neighbors
        const semantic = (0, index_js_1.semanticSearch)("database sql", graph.nodes()); // db first
        const fused = (0, index_js_1.reciprocalRankFusion)(structural, semantic, graph);
        const ids = fused.map((r) => r.id);
        (0, vitest_1.expect)(ids).toContain("auth.ts"); // from structural
        (0, vitest_1.expect)(ids).toContain("db.ts"); // from semantic
    });
});
// ────────── Context Builder ──────────
(0, vitest_1.describe)("T8 — estimateTokens", () => {
    (0, vitest_1.it)("estimates ~4 chars per token", () => {
        (0, vitest_1.expect)((0, index_js_1.estimateTokens)("hello")).toBe(2); // 5 chars / 4 = 1.25 → 2
        (0, vitest_1.expect)((0, index_js_1.estimateTokens)("a".repeat(100))).toBe(25);
    });
});
(0, vitest_1.describe)("T8 — buildContext", () => {
    (0, vitest_1.it)("respects token budget", () => {
        const graph = buildTestGraph();
        const structural = (0, index_js_1.structuralSearch)("auth", graph, 2);
        const semantic = (0, index_js_1.semanticSearch)("authentication", graph.nodes());
        const fused = (0, index_js_1.reciprocalRankFusion)(structural, semantic, graph);
        const ctx = (0, index_js_1.buildContext)(fused, "authentication", 100);
        (0, vitest_1.expect)(ctx.totalTokens).toBeLessThanOrEqual(100);
        (0, vitest_1.expect)(ctx.chunks.length).toBeGreaterThan(0);
    });
    (0, vitest_1.it)("includes node metadata in chunks", () => {
        const graph = buildTestGraph();
        const structural = (0, index_js_1.structuralSearch)("auth", graph, 1);
        const semantic = (0, index_js_1.semanticSearch)("auth", graph.nodes());
        const fused = (0, index_js_1.reciprocalRankFusion)(structural, semantic, graph);
        const ctx = (0, index_js_1.buildContext)(fused, "auth", 4000);
        const authChunk = ctx.chunks.find((c) => c.nodeId === "auth.ts");
        (0, vitest_1.expect)(authChunk).toBeDefined();
        (0, vitest_1.expect)(authChunk.content).toContain("auth");
    });
});
// ────────── Full Pipeline ──────────
(0, vitest_1.describe)("T8 — hybridRetrieve", () => {
    (0, vitest_1.it)("returns context for 'authentication login'", () => {
        const graph = buildTestGraph();
        const ctx = (0, index_js_1.hybridRetrieve)("authentication login", graph);
        (0, vitest_1.expect)(ctx.chunks.length).toBeGreaterThan(0);
        (0, vitest_1.expect)(ctx.totalTokens).toBeGreaterThan(0);
        (0, vitest_1.expect)(ctx.query).toBe("authentication login");
        // auth.ts should be in the context
        const authChunk = ctx.chunks.find((c) => c.nodeId === "auth.ts");
        (0, vitest_1.expect)(authChunk).toBeDefined();
    });
    (0, vitest_1.it)("returns context for 'database connection'", () => {
        const graph = buildTestGraph();
        const ctx = (0, index_js_1.hybridRetrieve)("database connection", graph);
        const dbChunk = ctx.chunks.find((c) => c.nodeId === "db.ts");
        (0, vitest_1.expect)(dbChunk).toBeDefined();
    });
    (0, vitest_1.it)("respects token budget option", () => {
        const graph = buildTestGraph();
        const ctx = (0, index_js_1.hybridRetrieve)("auth", graph, { tokenBudget: 50 });
        (0, vitest_1.expect)(ctx.totalTokens).toBeLessThanOrEqual(50);
    });
    (0, vitest_1.it)("handles empty graph", () => {
        const graph = new index_js_2.CodeGraph();
        const ctx = (0, index_js_1.hybridRetrieve)("anything", graph);
        (0, vitest_1.expect)(ctx.chunks).toHaveLength(0);
    });
});
//# sourceMappingURL=retrieval.test.js.map