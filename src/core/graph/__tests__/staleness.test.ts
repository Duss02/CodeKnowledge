import { describe, it, expect, beforeEach } from "vitest";
import { CodeGraph } from "../index.js";
import type { GraphEdge } from "../index.js";

/**
 * Build a linear chain: A → B → C → D → E
 * (A imports B, B imports C, etc.)
 */
function buildChain(graph: CodeGraph, depth: number = 5): string[] {
    const ids: string[] = [];
    for (let i = 0; i < depth; i++) {
        const id = `file_${String.fromCharCode(65 + i)}.ts`;
        ids.push(id);
        graph.addNode({
            id,
            type: "file",
            language: "typescript",
            path: id,
            name: id,
            lines: [1, 10] as [number, number],
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
function buildDiamond(graph: CodeGraph): string[] {
    const ids = ["A.ts", "B.ts", "C.ts", "D.ts"];
    for (const id of ids) {
        graph.addNode({
            id,
            type: "file",
            language: "typescript",
            path: id,
            name: id,
            lines: [1, 10] as [number, number],
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

describe("T4 — Multi-hop staleness propagation", () => {
    let graph: CodeGraph;

    beforeEach(() => {
        graph = new CodeGraph();
    });

    // ── Depth 0: no propagation ──

    it("depth 0: marks only the target node as stale", () => {
        buildChain(graph);
        const stale = graph.markStale("file_C.ts", 0);
        expect(stale.size).toBe(1);
        expect(stale.has("file_C.ts")).toBe(true);
        expect(graph.getNode("file_B.ts")?.stale).toBe(false);
    });

    // ── Depth 1: classic behavior ──

    it("depth 1: marks direct importers (1 hop)", () => {
        // Chain: A→B→C→D→E — mark C stale
        buildChain(graph);
        const stale = graph.markStale("file_C.ts", 1);
        // C itself + B (imports C)
        expect(stale.has("file_C.ts")).toBe(true);
        expect(stale.has("file_B.ts")).toBe(true);
        expect(stale.size).toBe(2);
        // A should NOT be stale
        expect(graph.getNode("file_A.ts")?.stale).toBe(false);
    });

    // ── Depth 2: two-hop propagation ──

    it("depth 2: marks 2-hop importers", () => {
        buildChain(graph);
        const stale = graph.markStale("file_C.ts", 2);
        expect(stale.has("file_C.ts")).toBe(true);
        expect(stale.has("file_B.ts")).toBe(true); // 1 hop
        expect(stale.has("file_A.ts")).toBe(true); // 2 hops
        expect(stale.size).toBe(3);
        // D and E should NOT be stale (they don't import C)
        expect(graph.getNode("file_D.ts")?.stale).toBe(false);
        expect(graph.getNode("file_E.ts")?.stale).toBe(false);
    });

    // ── Depth Infinity: marks the whole chain ──

    it("large depth: propagates through entire chain", () => {
        buildChain(graph);
        const stale = graph.markStale("file_E.ts", 100);
        // All 5 nodes should be stale (A→B→C→D→E, starting from E, BFS backward)
        expect(stale.size).toBe(5);
        for (const node of graph.nodes()) {
            expect(node.stale).toBe(true);
        }
    });

    // ── Diamond graph: no double-counting ──

    it("diamond: avoids visiting same node twice", () => {
        buildDiamond(graph);
        // Mark D stale with depth 2
        const stale = graph.markStale("D.ts", 2);
        // D, B (imports D), C (imports D), A (imports B and C)
        expect(stale.has("D.ts")).toBe(true);
        expect(stale.has("B.ts")).toBe(true);
        expect(stale.has("C.ts")).toBe(true);
        expect(stale.has("A.ts")).toBe(true);
        expect(stale.size).toBe(4);
    });

    // ── Default depth ──

    it("default depth is 1 when not specified", () => {
        buildChain(graph);
        const stale = graph.markStale("file_C.ts");
        expect(stale.size).toBe(2); // C + B
        expect(graph.getNode("file_A.ts")?.stale).toBe(false);
    });

    // ── Returns empty set for non-existent node ──

    it("non-existent node returns empty set with depth 0", () => {
        buildChain(graph);
        const stale = graph.markStale("nonexistent.ts", 0);
        expect(stale.size).toBe(0);
    });

    // ── Cycle handling ──

    it("handles circular imports without infinite loop", () => {
        // Create cycle: A → B → C → A
        for (const id of ["A.ts", "B.ts", "C.ts"]) {
            graph.addNode({
                id, type: "file", language: "typescript", path: id, name: id,
                lines: [1, 10] as [number, number], hash: `h-${id}`, exports: [],
                stale: false, last_indexed: new Date().toISOString(),
            });
        }
        graph.addEdge({ source: "A.ts", target: "B.ts", type: "imports", via: "" });
        graph.addEdge({ source: "B.ts", target: "C.ts", type: "imports", via: "" });
        graph.addEdge({ source: "C.ts", target: "A.ts", type: "imports", via: "" });

        const stale = graph.markStale("A.ts", 10);
        // All 3 should be stale and no infinite loop
        expect(stale.size).toBe(3);
    });

    // ── Performance ──

    it("handles large graphs (1000 nodes) efficiently", () => {
        const N = 1000;
        buildChain(graph, N);
        const start = performance.now();
        const stale = graph.markStale(`file_${String.fromCharCode(65 + N - 1)}.ts`, N);
        const elapsed = performance.now() - start;
        console.log(`  markStale BFS on ${N}-node chain: ${elapsed.toFixed(1)}ms, ${stale.size} stale`);
        expect(stale.size).toBe(N);
        expect(elapsed).toBeLessThan(500); // should be very fast
    });

    // ── staleNodes() ──

    it("staleNodes() returns only stale nodes after multi-hop propagation", () => {
        buildChain(graph);
        graph.markStale("file_D.ts", 2);
        const stale = graph.staleNodes();
        const staleIds = stale.map((n) => n.id).sort();
        expect(staleIds).toEqual(["file_B.ts", "file_C.ts", "file_D.ts"]);
    });
});

describe("T4 — GraphStore multi-hop staleness", () => {
    it("markStale/staleNodes work through GraphStore", async () => {
        const { GraphStore } = await import("../../storage/index.js");
        const store = await GraphStore.inMemory();
        // Insert A→B→C chain
        for (const id of ["A.ts", "B.ts", "C.ts"]) {
            store.upsertNode({
                id, type: "file", language: "typescript", path: id, name: id,
                lines: [1, 10] as [number, number], hash: `h-${id}`, exports: [],
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

        expect(store.getNode("C.ts")!.stale).toBe(true);
        expect(store.staleNodes().length).toBeGreaterThanOrEqual(2);
        store.close();
    });
});
