"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const index_js_1 = require("../index.js");
/**
 * Build a linear chain: A → B → C → D → E
 * (A imports B, B imports C, etc.)
 */
function buildChain(graph, depth = 5) {
    const ids = [];
    for (let i = 0; i < depth; i++) {
        const id = `file_${String.fromCharCode(65 + i)}.ts`;
        ids.push(id);
        graph.addNode({
            id,
            type: "file",
            language: "typescript",
            path: id,
            name: id,
            lines: [1, 10],
            hash: `hash-${i}`,
            exports: [],
            stale: false,
            last_indexed: new Date().toISOString(),
        });
    }
    // A imports B, B imports C, etc. → edges: A→B, B→C, C→D, D→E
    for (let i = 0; i < ids.length - 1; i++) {
        graph.addEdge({
            source: ids[i],
            target: ids[i + 1],
            type: "imports",
            via: `import`,
        });
    }
    return ids;
}
/**
 * Build a diamond: A → B, A → C, B → D, C → D
 */
function buildDiamond(graph) {
    const ids = ["A.ts", "B.ts", "C.ts", "D.ts"];
    for (const id of ids) {
        graph.addNode({
            id,
            type: "file",
            language: "typescript",
            path: id,
            name: id,
            lines: [1, 10],
            hash: `hash-${id}`,
            exports: [],
            stale: false,
            last_indexed: new Date().toISOString(),
        });
    }
    // A imports B and C; B and C both import D
    graph.addEdge({ source: "A.ts", target: "B.ts", type: "imports", via: "" });
    graph.addEdge({ source: "A.ts", target: "C.ts", type: "imports", via: "" });
    graph.addEdge({ source: "B.ts", target: "D.ts", type: "imports", via: "" });
    graph.addEdge({ source: "C.ts", target: "D.ts", type: "imports", via: "" });
    return ids;
}
(0, vitest_1.describe)("T4 — Multi-hop staleness propagation", () => {
    let graph;
    (0, vitest_1.beforeEach)(() => {
        graph = new index_js_1.CodeGraph();
    });
    // ── Depth 0: no propagation ──
    (0, vitest_1.it)("depth 0: marks only the target node as stale", () => {
        buildChain(graph);
        const stale = graph.markStale("file_C.ts", 0);
        (0, vitest_1.expect)(stale.size).toBe(1);
        (0, vitest_1.expect)(stale.has("file_C.ts")).toBe(true);
        (0, vitest_1.expect)(graph.getNode("file_B.ts")?.stale).toBe(false);
    });
    // ── Depth 1: classic behavior ──
    (0, vitest_1.it)("depth 1: marks direct importers (1 hop)", () => {
        // Chain: A→B→C→D→E — mark C stale
        buildChain(graph);
        const stale = graph.markStale("file_C.ts", 1);
        // C itself + B (imports C)
        (0, vitest_1.expect)(stale.has("file_C.ts")).toBe(true);
        (0, vitest_1.expect)(stale.has("file_B.ts")).toBe(true);
        (0, vitest_1.expect)(stale.size).toBe(2);
        // A should NOT be stale
        (0, vitest_1.expect)(graph.getNode("file_A.ts")?.stale).toBe(false);
    });
    // ── Depth 2: two-hop propagation ──
    (0, vitest_1.it)("depth 2: marks 2-hop importers", () => {
        buildChain(graph);
        const stale = graph.markStale("file_C.ts", 2);
        (0, vitest_1.expect)(stale.has("file_C.ts")).toBe(true);
        (0, vitest_1.expect)(stale.has("file_B.ts")).toBe(true); // 1 hop
        (0, vitest_1.expect)(stale.has("file_A.ts")).toBe(true); // 2 hops
        (0, vitest_1.expect)(stale.size).toBe(3);
        // D and E should NOT be stale (they don't import C)
        (0, vitest_1.expect)(graph.getNode("file_D.ts")?.stale).toBe(false);
        (0, vitest_1.expect)(graph.getNode("file_E.ts")?.stale).toBe(false);
    });
    // ── Depth Infinity: marks the whole chain ──
    (0, vitest_1.it)("large depth: propagates through entire chain", () => {
        buildChain(graph);
        const stale = graph.markStale("file_E.ts", 100);
        // All 5 nodes should be stale (A→B→C→D→E, starting from E, BFS backward)
        (0, vitest_1.expect)(stale.size).toBe(5);
        for (const node of graph.nodes()) {
            (0, vitest_1.expect)(node.stale).toBe(true);
        }
    });
    // ── Diamond graph: no double-counting ──
    (0, vitest_1.it)("diamond: avoids visiting same node twice", () => {
        buildDiamond(graph);
        // Mark D stale with depth 2
        const stale = graph.markStale("D.ts", 2);
        // D, B (imports D), C (imports D), A (imports B and C)
        (0, vitest_1.expect)(stale.has("D.ts")).toBe(true);
        (0, vitest_1.expect)(stale.has("B.ts")).toBe(true);
        (0, vitest_1.expect)(stale.has("C.ts")).toBe(true);
        (0, vitest_1.expect)(stale.has("A.ts")).toBe(true);
        (0, vitest_1.expect)(stale.size).toBe(4);
    });
    // ── Default depth ──
    (0, vitest_1.it)("default depth is 1 when not specified", () => {
        buildChain(graph);
        const stale = graph.markStale("file_C.ts");
        (0, vitest_1.expect)(stale.size).toBe(2); // C + B
        (0, vitest_1.expect)(graph.getNode("file_A.ts")?.stale).toBe(false);
    });
    // ── Returns empty set for non-existent node ──
    (0, vitest_1.it)("non-existent node returns empty set with depth 0", () => {
        buildChain(graph);
        const stale = graph.markStale("nonexistent.ts", 0);
        (0, vitest_1.expect)(stale.size).toBe(0);
    });
    // ── Cycle handling ──
    (0, vitest_1.it)("handles circular imports without infinite loop", () => {
        // Create cycle: A → B → C → A
        for (const id of ["A.ts", "B.ts", "C.ts"]) {
            graph.addNode({
                id, type: "file", language: "typescript", path: id, name: id,
                lines: [1, 10], hash: `h-${id}`, exports: [],
                stale: false, last_indexed: new Date().toISOString(),
            });
        }
        graph.addEdge({ source: "A.ts", target: "B.ts", type: "imports", via: "" });
        graph.addEdge({ source: "B.ts", target: "C.ts", type: "imports", via: "" });
        graph.addEdge({ source: "C.ts", target: "A.ts", type: "imports", via: "" });
        const stale = graph.markStale("A.ts", 10);
        // All 3 should be stale and no infinite loop
        (0, vitest_1.expect)(stale.size).toBe(3);
    });
    // ── Performance ──
    (0, vitest_1.it)("handles large graphs (1000 nodes) efficiently", () => {
        const N = 1000;
        buildChain(graph, N);
        const start = performance.now();
        const stale = graph.markStale(`file_${String.fromCharCode(65 + N - 1)}.ts`, N);
        const elapsed = performance.now() - start;
        console.log(`  markStale BFS on ${N}-node chain: ${elapsed.toFixed(1)}ms, ${stale.size} stale`);
        (0, vitest_1.expect)(stale.size).toBe(N);
        (0, vitest_1.expect)(elapsed).toBeLessThan(500); // should be very fast
    });
    // ── staleNodes() ──
    (0, vitest_1.it)("staleNodes() returns only stale nodes after multi-hop propagation", () => {
        buildChain(graph);
        graph.markStale("file_D.ts", 2);
        const stale = graph.staleNodes();
        const staleIds = stale.map((n) => n.id).sort();
        (0, vitest_1.expect)(staleIds).toEqual(["file_B.ts", "file_C.ts", "file_D.ts"]);
    });
});
(0, vitest_1.describe)("T4 — GraphStore multi-hop staleness", () => {
    (0, vitest_1.it)("markStale/staleNodes work through GraphStore", async () => {
        const { GraphStore } = await Promise.resolve().then(() => __importStar(require("../../storage/index.js")));
        const store = await GraphStore.inMemory();
        // Insert A→B→C chain
        for (const id of ["A.ts", "B.ts", "C.ts"]) {
            store.upsertNode({
                id, type: "file", language: "typescript", path: id, name: id,
                lines: [1, 10], hash: `h-${id}`, exports: [],
                stale: false, last_indexed: new Date().toISOString(),
            });
        }
        store.upsertEdge({ source: "A.ts", target: "B.ts", type: "imports", via: "" });
        store.upsertEdge({ source: "B.ts", target: "C.ts", type: "imports", via: "" });
        // Mark C stale — should stale B (1 hop)
        store.markStale("C.ts");
        // Also manually stale B's importer A
        const edgesToC = store.edgesTo("C.ts");
        for (const e of edgesToC) {
            store.markStale(e.source);
        }
        (0, vitest_1.expect)(store.getNode("C.ts").stale).toBe(true);
        (0, vitest_1.expect)(store.staleNodes().length).toBeGreaterThanOrEqual(2);
        store.close();
    });
});
//# sourceMappingURL=staleness.test.js.map