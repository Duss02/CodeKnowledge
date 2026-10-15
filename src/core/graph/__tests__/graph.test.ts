import { describe, it, expect, beforeEach } from "vitest";
import { CodeGraph, type GraphNode, type GraphEdge } from "../index.js";

function makeNode(id: string, overrides: Partial<GraphNode> = {}): GraphNode {
    return {
        id,
        type: "file",
        language: "typescript",
        path: id,
        name: id.split("/").pop() || id,
        lines: [1, 50] as [number, number],
        hash: `hash-${id}`,
        exports: [],
        stale: false,
        last_indexed: new Date().toISOString(),
        ...overrides,
    };
}

function makeEdge(source: string, target: string, overrides: Partial<GraphEdge> = {}): GraphEdge {
    return {
        source,
        target,
        type: "imports",
        via: `import from '${target}'`,
        ...overrides,
    };
}

describe("CodeGraph", () => {
    let graph: CodeGraph;

    beforeEach(() => {
        graph = new CodeGraph();
    });

    // --- Node operations ---

    describe("addNode / getNode", () => {
        it("adds and retrieves a node", () => {
            const node = makeNode("src/auth.ts");
            graph.addNode(node);
            const retrieved = graph.getNode("src/auth.ts");
            expect(retrieved).toBeDefined();
            expect(retrieved!.id).toBe("src/auth.ts");
            expect(retrieved!.language).toBe("typescript");
        });

        it("replaces node on duplicate id", () => {
            graph.addNode(makeNode("src/a.ts", { hash: "old" }));
            graph.addNode(makeNode("src/a.ts", { hash: "new" }));
            expect(graph.getNode("src/a.ts")!.hash).toBe("new");
            expect(graph.nodeCount()).toBe(1);
        });

        it("returns undefined for non-existent node", () => {
            expect(graph.getNode("nope")).toBeUndefined();
        });
    });

    describe("hasNode", () => {
        it("returns true when node exists", () => {
            graph.addNode(makeNode("src/a.ts"));
            expect(graph.hasNode("src/a.ts")).toBe(true);
        });

        it("returns false when node doesn't exist", () => {
            expect(graph.hasNode("src/nope.ts")).toBe(false);
        });
    });

    describe("updateNode", () => {
        it("merges partial attributes", () => {
            graph.addNode(makeNode("src/a.ts"));
            graph.updateNode("src/a.ts", { summary: "Does auth stuff", tags: ["auth"] });
            const node = graph.getNode("src/a.ts");
            expect(node!.summary).toBe("Does auth stuff");
            expect(node!.tags).toEqual(["auth"]);
            expect(node!.language).toBe("typescript"); // original preserved
        });

        it("silently ignores updates for non-existent node", () => {
            // Should not throw
            graph.updateNode("nope", { summary: "test" });
        });
    });

    describe("removeNode", () => {
        it("removes existing node", () => {
            graph.addNode(makeNode("src/a.ts"));
            graph.removeNode("src/a.ts");
            expect(graph.hasNode("src/a.ts")).toBe(false);
            expect(graph.nodeCount()).toBe(0);
        });

        it("silently ignores removal of non-existent node", () => {
            graph.removeNode("nope"); // should not throw
        });
    });

    describe("nodes / nodeCount", () => {
        it("returns all nodes", () => {
            graph.addNode(makeNode("src/a.ts"));
            graph.addNode(makeNode("src/b.ts"));
            expect(graph.nodes()).toHaveLength(2);
            expect(graph.nodeCount()).toBe(2);
        });

        it("returns empty array for empty graph", () => {
            expect(graph.nodes()).toEqual([]);
            expect(graph.nodeCount()).toBe(0);
        });
    });

    // --- Edge operations ---

    describe("addEdge / edges", () => {
        it("adds edge between existing nodes", () => {
            graph.addNode(makeNode("src/a.ts"));
            graph.addNode(makeNode("src/b.ts"));
            graph.addEdge(makeEdge("src/a.ts", "src/b.ts"));
            expect(graph.edgeCount()).toBe(1);
        });

        it("auto-creates placeholder nodes for missing edge endpoints", () => {
            graph.addEdge(makeEdge("src/x.ts", "src/y.ts"));
            expect(graph.hasNode("src/x.ts")).toBe(true);
            expect(graph.hasNode("src/y.ts")).toBe(true);
        });

        it("ignores duplicate edges", () => {
            graph.addNode(makeNode("src/a.ts"));
            graph.addNode(makeNode("src/b.ts"));
            graph.addEdge(makeEdge("src/a.ts", "src/b.ts"));
            graph.addEdge(makeEdge("src/a.ts", "src/b.ts"));
            expect(graph.edgeCount()).toBe(1);
        });
    });

    // --- Traversal ---

    describe("predecessors / successors", () => {
        beforeEach(() => {
            // A → B → C
            graph.addNode(makeNode("A"));
            graph.addNode(makeNode("B"));
            graph.addNode(makeNode("C"));
            graph.addEdge(makeEdge("A", "B"));
            graph.addEdge(makeEdge("B", "C"));
        });

        it("predecessors returns direct incoming neighbors", () => {
            const preds = graph.predecessors("B");
            expect(preds).toHaveLength(1);
            expect(preds[0].id).toBe("A");
        });

        it("successors returns direct outgoing neighbors", () => {
            const succs = graph.successors("B");
            expect(succs).toHaveLength(1);
            expect(succs[0].id).toBe("C");
        });

        it("returns empty for nodes with no connections in that direction", () => {
            expect(graph.predecessors("A")).toHaveLength(0);
            expect(graph.successors("C")).toHaveLength(0);
        });

        it("returns empty for non-existent node", () => {
            expect(graph.predecessors("nope")).toEqual([]);
            expect(graph.successors("nope")).toEqual([]);
        });
    });

    describe("transitiveSuccessors", () => {
        beforeEach(() => {
            // A → B → C → D → E
            ["A", "B", "C", "D", "E"].forEach((id) => graph.addNode(makeNode(id)));
            graph.addEdge(makeEdge("A", "B"));
            graph.addEdge(makeEdge("B", "C"));
            graph.addEdge(makeEdge("C", "D"));
            graph.addEdge(makeEdge("D", "E"));
        });

        it("returns transitive successors up to default maxDepth (3)", () => {
            const result = graph.transitiveSuccessors("A");
            const ids = result.map((n) => n.id);
            expect(ids).toContain("B");
            expect(ids).toContain("C");
            expect(ids).toContain("D");
            expect(ids).not.toContain("E"); // depth 4
        });

        it("respects custom maxDepth", () => {
            const result = graph.transitiveSuccessors("A", 1);
            const ids = result.map((n) => n.id);
            expect(ids).toEqual(["B"]);
        });

        it("handles cycles without infinite loop", () => {
            graph.addEdge(makeEdge("D", "A")); // create cycle
            const result = graph.transitiveSuccessors("A", 10);
            // Should terminate and return unique nodes
            expect(result.length).toBeLessThanOrEqual(4); // B, C, D, E
        });

        it("does not include the start node itself", () => {
            const result = graph.transitiveSuccessors("A");
            const ids = result.map((n) => n.id);
            expect(ids).not.toContain("A");
        });
    });

    describe("transitivePredecessors", () => {
        beforeEach(() => {
            // A → B → C → D
            ["A", "B", "C", "D"].forEach((id) => graph.addNode(makeNode(id)));
            graph.addEdge(makeEdge("A", "B"));
            graph.addEdge(makeEdge("B", "C"));
            graph.addEdge(makeEdge("C", "D"));
        });

        it("returns transitive predecessors", () => {
            const result = graph.transitivePredecessors("D");
            const ids = result.map((n) => n.id);
            expect(ids).toContain("C");
            expect(ids).toContain("B");
            expect(ids).toContain("A");
        });

        it("respects custom maxDepth", () => {
            const result = graph.transitivePredecessors("D", 1);
            const ids = result.map((n) => n.id);
            expect(ids).toEqual(["C"]);
        });
    });

    // --- Search ---

    describe("search", () => {
        beforeEach(() => {
            graph.addNode(makeNode("src/auth/AuthService.ts", {
                name: "AuthService.ts",
                summary: "Handles JWT authentication",
                tags: ["auth", "jwt"],
            }));
            graph.addNode(makeNode("src/users/UserRepo.ts", {
                name: "UserRepo.ts",
                summary: "Database repository for users",
                tags: ["database", "users"],
            }));
        });

        it("matches by id (path)", () => {
            const results = graph.search("auth");
            expect(results.some((n) => n.id === "src/auth/AuthService.ts")).toBe(true);
        });

        it("matches by name", () => {
            const results = graph.search("AuthService");
            expect(results).toHaveLength(1);
        });

        it("matches by summary", () => {
            const results = graph.search("JWT");
            expect(results).toHaveLength(1);
        });

        it("matches by tags", () => {
            const results = graph.search("database");
            expect(results.some((n) => n.id === "src/users/UserRepo.ts")).toBe(true);
        });

        it("returns empty for no match", () => {
            expect(graph.search("zzz_no_match")).toEqual([]);
        });

        it("is case-insensitive", () => {
            expect(graph.search("AUTHSERVICE")).toHaveLength(1);
        });
    });

    // --- Entry points ---

    describe("entryPoints", () => {
        it("returns nodes with no incoming edges", () => {
            graph.addNode(makeNode("main.ts"));
            graph.addNode(makeNode("util.ts"));
            graph.addEdge(makeEdge("main.ts", "util.ts"));
            const entry = graph.entryPoints();
            expect(entry).toHaveLength(1);
            expect(entry[0].id).toBe("main.ts");
        });

        it("excludes non-file nodes from entry points", () => {
            graph.addNode(makeNode("MyClass", { type: "class" }));
            const entry = graph.entryPoints();
            expect(entry).toHaveLength(0);
        });
    });

    // --- Stale tracking ---

    describe("markStale / staleNodes", () => {
        beforeEach(() => {
            // A → B (A imports B)
            graph.addNode(makeNode("A", { stale: false }));
            graph.addNode(makeNode("B", { stale: false }));
            graph.addEdge(makeEdge("A", "B"));
        });

        it("marks the node itself as stale", () => {
            graph.markStale("B");
            expect(graph.getNode("B")!.stale).toBe(true);
        });

        it("marks importers (predecessors) as stale", () => {
            graph.markStale("B");
            // A imports B, so A should also be stale
            expect(graph.getNode("A")!.stale).toBe(true);
        });

        it("staleNodes returns all stale nodes", () => {
            graph.markStale("B");
            const stale = graph.staleNodes();
            expect(stale).toHaveLength(2);
        });

        it("returns empty when nothing is stale", () => {
            expect(graph.staleNodes()).toHaveLength(0);
        });
    });

    // --- getRawGraph ---

    describe("getRawGraph", () => {
        it("returns the underlying graphology instance", () => {
            const raw = graph.getRawGraph();
            expect(raw).toBeDefined();
            expect(typeof raw.addNode).toBe("function");
        });
    });
});
