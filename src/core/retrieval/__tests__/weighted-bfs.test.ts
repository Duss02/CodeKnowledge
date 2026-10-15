import { describe, it, expect } from "vitest";
import { PriorityQueue } from "../priority-queue.js";
import {
    structuralSearch,
    DEFAULT_WEIGHTS,
    type TraversalOptions,
} from "../index.js";
import { CodeGraph } from "../../graph/index.js";
import type { GraphNode } from "../../graph/index.js";

function makeNode(id: string, name: string, type: GraphNode["type"] = "file", extras: Partial<GraphNode> = {}): GraphNode {
    return {
        id, type, language: "typescript", path: id, name,
        lines: [1, 10] as [number, number], hash: `h-${id}`,
        exports: [], stale: false, last_indexed: new Date().toISOString(),
        ...extras,
    };
}

// ────────── Priority Queue ──────────

describe("T12 — PriorityQueue", () => {
    it("pops items in descending priority order", () => {
        const pq = new PriorityQueue<string>();
        pq.push("low", 1);
        pq.push("high", 10);
        pq.push("mid", 5);
        expect(pq.pop()).toBe("high");
        expect(pq.pop()).toBe("mid");
        expect(pq.pop()).toBe("low");
    });

    it("returns undefined when empty", () => {
        const pq = new PriorityQueue<number>();
        expect(pq.pop()).toBeUndefined();
    });

    it("peek shows top without removing", () => {
        const pq = new PriorityQueue<string>();
        pq.push("a", 5);
        pq.push("b", 10);
        expect(pq.peek()).toBe("b");
        expect(pq.size).toBe(2);
    });

    it("handles many items correctly", () => {
        const pq = new PriorityQueue<number>();
        const values = Array.from({ length: 100 }, (_, i) => i);
        // Insert in random order
        for (const v of values.sort(() => Math.random() - 0.5)) {
            pq.push(v, v);
        }
        // Should come out in descending order
        const out: number[] = [];
        while (pq.size > 0) out.push(pq.pop()!);
        for (let i = 1; i < out.length; i++) {
            expect(out[i - 1]).toBeGreaterThanOrEqual(out[i]);
        }
    });
});

// ────────── Edge Type Weighting ──────────

describe("T12 — Edge type weighting", () => {
    it("calls edges rank neighbors higher than contains edges", () => {
        const graph = new CodeGraph();
        graph.addNode(makeNode("entry.ts", "entry.ts", "file"));
        graph.addNode(makeNode("important.ts", "important.ts", "file", { summary: "critical dependency" }));
        graph.addNode(makeNode("method.ts", "method.ts", "function"));

        // calls edge to important.ts, contains edge to method.ts
        graph.addEdge({ source: "entry.ts", target: "important.ts", type: "calls", via: "" });
        graph.addEdge({ source: "entry.ts", target: "method.ts", type: "contains", via: "" });

        const results = structuralSearch("entry", graph, 2);
        const importantIdx = results.findIndex((r) => r.node.id === "important.ts");
        const methodIdx = results.findIndex((r) => r.node.id === "method.ts");

        // Both should be found
        expect(importantIdx).toBeGreaterThanOrEqual(0);
        expect(methodIdx).toBeGreaterThanOrEqual(0);

        // The calls-connected node should score higher
        const importantScore = results[importantIdx].score;
        const methodScore = results[methodIdx].score;
        expect(importantScore).toBeGreaterThan(methodScore);
    });

    it("imports edges rank higher than contains edges", () => {
        const graph = new CodeGraph();
        graph.addNode(makeNode("app.ts", "app.ts", "file"));
        graph.addNode(makeNode("dep.ts", "dep.ts", "file"));
        graph.addNode(makeNode("inner.ts", "inner.ts", "function"));

        graph.addEdge({ source: "app.ts", target: "dep.ts", type: "imports", via: "" });
        graph.addEdge({ source: "app.ts", target: "inner.ts", type: "contains", via: "" });

        const results = structuralSearch("app", graph, 2);
        const depResult = results.find((r) => r.node.id === "dep.ts");
        const innerResult = results.find((r) => r.node.id === "inner.ts");

        expect(depResult).toBeDefined();
        expect(innerResult).toBeDefined();
        expect(depResult!.score).toBeGreaterThan(innerResult!.score);
    });
});

// ────────── Centrality ──────────

describe("T12 — Centrality scoring", () => {
    it("hub nodes score higher than leaf nodes", () => {
        const graph = new CodeGraph();
        // Hub node: many connections
        graph.addNode(makeNode("hub.ts", "hub.ts", "file"));
        graph.addNode(makeNode("leaf.ts", "leaf.ts", "file"));
        graph.addNode(makeNode("seed.ts", "seed.ts", "file"));
        graph.addNode(makeNode("a.ts", "a.ts", "file"));
        graph.addNode(makeNode("b.ts", "b.ts", "file"));
        graph.addNode(makeNode("c.ts", "c.ts", "file"));

        // Hub has many edges
        graph.addEdge({ source: "seed.ts", target: "hub.ts", type: "imports", via: "" });
        graph.addEdge({ source: "seed.ts", target: "leaf.ts", type: "imports", via: "" });
        graph.addEdge({ source: "a.ts", target: "hub.ts", type: "imports", via: "" });
        graph.addEdge({ source: "b.ts", target: "hub.ts", type: "imports", via: "" });
        graph.addEdge({ source: "c.ts", target: "hub.ts", type: "imports", via: "" });

        const results = structuralSearch("seed", graph, 2);
        const hubResult = results.find((r) => r.node.id === "hub.ts");
        const leafResult = results.find((r) => r.node.id === "leaf.ts");

        expect(hubResult).toBeDefined();
        expect(leafResult).toBeDefined();
        // Hub should score higher due to centrality
        expect(hubResult!.score).toBeGreaterThan(leafResult!.score);
    });

    it("computeCentrality returns normalized scores", () => {
        const graph = new CodeGraph();
        graph.addNode(makeNode("a.ts", "a.ts"));
        graph.addNode(makeNode("b.ts", "b.ts"));
        graph.addNode(makeNode("c.ts", "c.ts"));
        graph.addEdge({ source: "a.ts", target: "b.ts", type: "imports", via: "" });
        graph.addEdge({ source: "c.ts", target: "b.ts", type: "imports", via: "" });

        const centrality = graph.computeCentrality();
        // b has highest degree (2 in-edges)
        expect(centrality.get("b.ts")).toBe(1.0); // normalized max
        expect(centrality.get("a.ts")!).toBeLessThan(1.0);
    });
});

// ────────── Traversal Budget ──────────

describe("T12 — Traversal budget and early termination", () => {
    it("respects traversal budget", () => {
        const graph = new CodeGraph();
        // Build a chain: seed → a → b → c → d → e ...
        graph.addNode(makeNode("seed.ts", "seed.ts", "file"));
        for (let i = 0; i < 50; i++) {
            const id = `node${i}.ts`;
            graph.addNode(makeNode(id, id, "file"));
            const prev = i === 0 ? "seed.ts" : `node${i - 1}.ts`;
            graph.addEdge({ source: prev, target: id, type: "imports", via: "" });
        }

        const results = structuralSearch("seed", graph, 100, 200, { budget: 10 });
        // Should not expand more than budget allows
        expect(results.length).toBeLessThanOrEqual(11); // 1 seed + at most 10 expanded
    });

    it("score threshold stops low-confidence expansion", () => {
        const graph = new CodeGraph();
        graph.addNode(makeNode("match.ts", "match.ts", "file"));
        graph.addNode(makeNode("distant.ts", "distant.ts", "file"));
        graph.addEdge({ source: "match.ts", target: "distant.ts", type: "contains", via: "" });

        // With very high threshold, only direct matches should appear
        const results = structuralSearch("match", graph, 10, 20, { scoreThreshold: 0.99 });
        expect(results.length).toBe(1); // only the direct match
        expect(results[0].node.id).toBe("match.ts");
    });
});

// ────────── Edge Accessor Methods ──────────

describe("T12 — Graph edge accessors", () => {
    it("edgesFrom returns outbound edges", () => {
        const graph = new CodeGraph();
        graph.addNode(makeNode("a.ts", "a.ts"));
        graph.addNode(makeNode("b.ts", "b.ts"));
        graph.addNode(makeNode("c.ts", "c.ts"));
        graph.addEdge({ source: "a.ts", target: "b.ts", type: "imports", via: "" });
        graph.addEdge({ source: "a.ts", target: "c.ts", type: "calls", via: "" });
        graph.addEdge({ source: "b.ts", target: "c.ts", type: "imports", via: "" });

        const edges = graph.edgesFrom("a.ts");
        expect(edges.length).toBe(2);
        expect(edges.map((e) => e.target).sort()).toEqual(["b.ts", "c.ts"]);
    });

    it("edgesTo returns inbound edges", () => {
        const graph = new CodeGraph();
        graph.addNode(makeNode("a.ts", "a.ts"));
        graph.addNode(makeNode("b.ts", "b.ts"));
        graph.addNode(makeNode("c.ts", "c.ts"));
        graph.addEdge({ source: "a.ts", target: "c.ts", type: "imports", via: "" });
        graph.addEdge({ source: "b.ts", target: "c.ts", type: "calls", via: "" });

        const edges = graph.edgesTo("c.ts");
        expect(edges.length).toBe(2);
        expect(edges.map((e) => e.source).sort()).toEqual(["a.ts", "b.ts"]);
    });

    it("returns empty for non-existent nodes", () => {
        const graph = new CodeGraph();
        expect(graph.edgesFrom("nope")).toEqual([]);
        expect(graph.edgesTo("nope")).toEqual([]);
    });
});
