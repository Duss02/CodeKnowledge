import { describe, it, expect } from "vitest";
import {
    structuralSearch,
    semanticSearch,
    reciprocalRankFusion,
    buildContext,
    estimateTokens,
    hybridRetrieve,
} from "../index.js";
import { CodeGraph } from "../../graph/index.js";
import type { GraphNode, GraphEdge } from "../../graph/index.js";

function makeNode(id: string, name: string, type: GraphNode["type"] = "file", extras: Partial<GraphNode> = {}): GraphNode {
    return {
        id, type, language: "typescript", path: id, name,
        lines: [1, 10] as [number, number], hash: `h-${id}`,
        exports: [], stale: false, last_indexed: new Date().toISOString(),
        ...extras,
    };
}

function buildTestGraph(): CodeGraph {
    const graph = new CodeGraph();
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

describe("T8 — structuralSearch", () => {
    it("finds direct name matches", () => {
        const graph = buildTestGraph();
        const results = structuralSearch("auth", graph);
        expect(results[0].node.id).toBe("auth.ts");
        expect(results[0].hops).toBe(0);
        expect(results[0].score).toBeGreaterThan(0);
    });

    it("expands to neighbors via BFS", () => {
        const graph = buildTestGraph();
        const results = structuralSearch("auth", graph, 2);
        const ids = results.map((r) => r.node.id);
        expect(ids).toContain("auth.ts"); // direct match
        expect(ids).toContain("user.ts"); // 1-hop neighbor
        expect(ids).toContain("utils.ts"); // 1-hop neighbor
    });

    it("hop 2 reaches db.ts through auth→user→db", () => {
        const graph = buildTestGraph();
        const results = structuralSearch("auth", graph, 2);
        const dbResult = results.find((r) => r.node.id === "db.ts");
        expect(dbResult).toBeDefined();
        expect(dbResult!.hops).toBe(2);
    });

    it("returns empty for no matches", () => {
        const graph = buildTestGraph();
        const results = structuralSearch("nonexistent_module_xyz", graph);
        expect(results).toHaveLength(0);
    });
});

// ────────── Semantic Search ──────────

describe("T8 — semanticSearch", () => {
    it("ranks auth-related nodes highest for auth query", () => {
        const graph = buildTestGraph();
        const results = semanticSearch("authentication login jwt security", graph.nodes());
        expect(results[0].id).toBe("auth.ts");
    });

    it("ranks db-related nodes highest for database query", () => {
        const graph = buildTestGraph();
        const results = semanticSearch("database sql connection pool", graph.nodes());
        expect(results[0].id).toBe("db.ts");
    });
});

// ────────── RRF Fusion ──────────

describe("T8 — reciprocalRankFusion", () => {
    it("merges structural and semantic results", () => {
        const graph = buildTestGraph();
        const structural = structuralSearch("auth", graph, 2);
        const semantic = semanticSearch("authentication login", graph.nodes());
        const fused = reciprocalRankFusion(structural, semantic, graph);

        expect(fused.length).toBeGreaterThan(0);
        // auth.ts should appear in top results (strong in both)
        expect(fused[0].id).toBe("auth.ts");
        expect(fused[0].fusedScore).toBeGreaterThan(0);
    });

    it("includes nodes from both sources", () => {
        const graph = buildTestGraph();
        const structural = structuralSearch("auth", graph, 1); // auth + neighbors
        const semantic = semanticSearch("database sql", graph.nodes()); // db first
        const fused = reciprocalRankFusion(structural, semantic, graph);

        const ids = fused.map((r) => r.id);
        expect(ids).toContain("auth.ts"); // from structural
        expect(ids).toContain("db.ts"); // from semantic
    });
});

// ────────── Context Builder ──────────

describe("T8 — estimateTokens", () => {
    it("estimates ~4 chars per token", () => {
        expect(estimateTokens("hello")).toBe(2); // 5 chars / 4 = 1.25 → 2
        expect(estimateTokens("a".repeat(100))).toBe(25);
    });
});

describe("T8 — buildContext", () => {
    it("respects token budget", () => {
        const graph = buildTestGraph();
        const structural = structuralSearch("auth", graph, 2);
        const semantic = semanticSearch("authentication", graph.nodes());
        const fused = reciprocalRankFusion(structural, semantic, graph);

        const ctx = buildContext(fused, "authentication", 100);
        expect(ctx.totalTokens).toBeLessThanOrEqual(100);
        expect(ctx.chunks.length).toBeGreaterThan(0);
    });

    it("includes node metadata in chunks", () => {
        const graph = buildTestGraph();
        const structural = structuralSearch("auth", graph, 1);
        const semantic = semanticSearch("auth", graph.nodes());
        const fused = reciprocalRankFusion(structural, semantic, graph);

        const ctx = buildContext(fused, "auth", 4000);
        const authChunk = ctx.chunks.find((c) => c.nodeId === "auth.ts");
        expect(authChunk).toBeDefined();
        expect(authChunk!.content).toContain("auth");
    });
});

// ────────── Full Pipeline ──────────

describe("T8 — hybridRetrieve", () => {
    it("returns context for 'authentication login'", () => {
        const graph = buildTestGraph();
        const ctx = hybridRetrieve("authentication login", graph);
        expect(ctx.chunks.length).toBeGreaterThan(0);
        expect(ctx.totalTokens).toBeGreaterThan(0);
        expect(ctx.query).toBe("authentication login");
        // auth.ts should be in the context
        const authChunk = ctx.chunks.find((c) => c.nodeId === "auth.ts");
        expect(authChunk).toBeDefined();
    });

    it("returns context for 'database connection'", () => {
        const graph = buildTestGraph();
        const ctx = hybridRetrieve("database connection", graph);
        const dbChunk = ctx.chunks.find((c) => c.nodeId === "db.ts");
        expect(dbChunk).toBeDefined();
    });

    it("respects token budget option", () => {
        const graph = buildTestGraph();
        const ctx = hybridRetrieve("auth", graph, { tokenBudget: 50 });
        expect(ctx.totalTokens).toBeLessThanOrEqual(50);
    });

    it("handles empty graph", () => {
        const graph = new CodeGraph();
        const ctx = hybridRetrieve("anything", graph);
        expect(ctx.chunks).toHaveLength(0);
    });
});
