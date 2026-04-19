"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const index_js_1 = require("../index.js");
function makeNode(id, overrides = {}) {
    return {
        id,
        type: "file",
        language: "typescript",
        path: id,
        name: id.split("/").pop() || id,
        lines: [1, 50],
        hash: `hash-${id}`,
        exports: [],
        stale: false,
        last_indexed: new Date().toISOString(),
        ...overrides,
    };
}
function makeEdge(source, target, overrides = {}) {
    return {
        source,
        target,
        type: "imports",
        via: `import from '${target}'`,
        ...overrides,
    };
}
(0, vitest_1.describe)("CodeGraph", () => {
    let graph;
    (0, vitest_1.beforeEach)(() => {
        graph = new index_js_1.CodeGraph();
    });
    // --- Node operations ---
    (0, vitest_1.describe)("addNode / getNode", () => {
        (0, vitest_1.it)("adds and retrieves a node", () => {
            const node = makeNode("src/auth.ts");
            graph.addNode(node);
            const retrieved = graph.getNode("src/auth.ts");
            (0, vitest_1.expect)(retrieved).toBeDefined();
            (0, vitest_1.expect)(retrieved.id).toBe("src/auth.ts");
            (0, vitest_1.expect)(retrieved.language).toBe("typescript");
        });
        (0, vitest_1.it)("replaces node on duplicate id", () => {
            graph.addNode(makeNode("src/a.ts", { hash: "old" }));
            graph.addNode(makeNode("src/a.ts", { hash: "new" }));
            (0, vitest_1.expect)(graph.getNode("src/a.ts").hash).toBe("new");
            (0, vitest_1.expect)(graph.nodeCount()).toBe(1);
        });
        (0, vitest_1.it)("returns undefined for non-existent node", () => {
            (0, vitest_1.expect)(graph.getNode("nope")).toBeUndefined();
        });
    });
    (0, vitest_1.describe)("hasNode", () => {
        (0, vitest_1.it)("returns true when node exists", () => {
            graph.addNode(makeNode("src/a.ts"));
            (0, vitest_1.expect)(graph.hasNode("src/a.ts")).toBe(true);
        });
        (0, vitest_1.it)("returns false when node doesn't exist", () => {
            (0, vitest_1.expect)(graph.hasNode("src/nope.ts")).toBe(false);
        });
    });
    (0, vitest_1.describe)("updateNode", () => {
        (0, vitest_1.it)("merges partial attributes", () => {
            graph.addNode(makeNode("src/a.ts"));
            graph.updateNode("src/a.ts", { summary: "Does auth stuff", tags: ["auth"] });
            const node = graph.getNode("src/a.ts");
            (0, vitest_1.expect)(node.summary).toBe("Does auth stuff");
            (0, vitest_1.expect)(node.tags).toEqual(["auth"]);
            (0, vitest_1.expect)(node.language).toBe("typescript"); // original preserved
        });
        (0, vitest_1.it)("silently ignores updates for non-existent node", () => {
            // Should not throw
            graph.updateNode("nope", { summary: "test" });
        });
    });
    (0, vitest_1.describe)("removeNode", () => {
        (0, vitest_1.it)("removes existing node", () => {
            graph.addNode(makeNode("src/a.ts"));
            graph.removeNode("src/a.ts");
            (0, vitest_1.expect)(graph.hasNode("src/a.ts")).toBe(false);
            (0, vitest_1.expect)(graph.nodeCount()).toBe(0);
        });
        (0, vitest_1.it)("silently ignores removal of non-existent node", () => {
            graph.removeNode("nope"); // should not throw
        });
    });
    (0, vitest_1.describe)("nodes / nodeCount", () => {
        (0, vitest_1.it)("returns all nodes", () => {
            graph.addNode(makeNode("src/a.ts"));
            graph.addNode(makeNode("src/b.ts"));
            (0, vitest_1.expect)(graph.nodes()).toHaveLength(2);
            (0, vitest_1.expect)(graph.nodeCount()).toBe(2);
        });
        (0, vitest_1.it)("returns empty array for empty graph", () => {
            (0, vitest_1.expect)(graph.nodes()).toEqual([]);
            (0, vitest_1.expect)(graph.nodeCount()).toBe(0);
        });
    });
    // --- Edge operations ---
    (0, vitest_1.describe)("addEdge / edges", () => {
        (0, vitest_1.it)("adds edge between existing nodes", () => {
            graph.addNode(makeNode("src/a.ts"));
            graph.addNode(makeNode("src/b.ts"));
            graph.addEdge(makeEdge("src/a.ts", "src/b.ts"));
            (0, vitest_1.expect)(graph.edgeCount()).toBe(1);
        });
        (0, vitest_1.it)("auto-creates placeholder nodes for missing edge endpoints", () => {
            graph.addEdge(makeEdge("src/x.ts", "src/y.ts"));
            (0, vitest_1.expect)(graph.hasNode("src/x.ts")).toBe(true);
            (0, vitest_1.expect)(graph.hasNode("src/y.ts")).toBe(true);
        });
        (0, vitest_1.it)("ignores duplicate edges", () => {
            graph.addNode(makeNode("src/a.ts"));
            graph.addNode(makeNode("src/b.ts"));
            graph.addEdge(makeEdge("src/a.ts", "src/b.ts"));
            graph.addEdge(makeEdge("src/a.ts", "src/b.ts"));
            (0, vitest_1.expect)(graph.edgeCount()).toBe(1);
        });
    });
    // --- Traversal ---
    (0, vitest_1.describe)("predecessors / successors", () => {
        (0, vitest_1.beforeEach)(() => {
            // A → B → C
            graph.addNode(makeNode("A"));
            graph.addNode(makeNode("B"));
            graph.addNode(makeNode("C"));
            graph.addEdge(makeEdge("A", "B"));
            graph.addEdge(makeEdge("B", "C"));
        });
        (0, vitest_1.it)("predecessors returns direct incoming neighbors", () => {
            const preds = graph.predecessors("B");
            (0, vitest_1.expect)(preds).toHaveLength(1);
            (0, vitest_1.expect)(preds[0].id).toBe("A");
        });
        (0, vitest_1.it)("successors returns direct outgoing neighbors", () => {
            const succs = graph.successors("B");
            (0, vitest_1.expect)(succs).toHaveLength(1);
            (0, vitest_1.expect)(succs[0].id).toBe("C");
        });
        (0, vitest_1.it)("returns empty for nodes with no connections in that direction", () => {
            (0, vitest_1.expect)(graph.predecessors("A")).toHaveLength(0);
            (0, vitest_1.expect)(graph.successors("C")).toHaveLength(0);
        });
        (0, vitest_1.it)("returns empty for non-existent node", () => {
            (0, vitest_1.expect)(graph.predecessors("nope")).toEqual([]);
            (0, vitest_1.expect)(graph.successors("nope")).toEqual([]);
        });
    });
    (0, vitest_1.describe)("transitiveSuccessors", () => {
        (0, vitest_1.beforeEach)(() => {
            // A → B → C → D → E
            ["A", "B", "C", "D", "E"].forEach((id) => graph.addNode(makeNode(id)));
            graph.addEdge(makeEdge("A", "B"));
            graph.addEdge(makeEdge("B", "C"));
            graph.addEdge(makeEdge("C", "D"));
            graph.addEdge(makeEdge("D", "E"));
        });
        (0, vitest_1.it)("returns transitive successors up to default maxDepth (3)", () => {
            const result = graph.transitiveSuccessors("A");
            const ids = result.map((n) => n.id);
            (0, vitest_1.expect)(ids).toContain("B");
            (0, vitest_1.expect)(ids).toContain("C");
            (0, vitest_1.expect)(ids).toContain("D");
            (0, vitest_1.expect)(ids).not.toContain("E"); // depth 4
        });
        (0, vitest_1.it)("respects custom maxDepth", () => {
            const result = graph.transitiveSuccessors("A", 1);
            const ids = result.map((n) => n.id);
            (0, vitest_1.expect)(ids).toEqual(["B"]);
        });
        (0, vitest_1.it)("handles cycles without infinite loop", () => {
            graph.addEdge(makeEdge("D", "A")); // create cycle
            const result = graph.transitiveSuccessors("A", 10);
            // Should terminate and return unique nodes
            (0, vitest_1.expect)(result.length).toBeLessThanOrEqual(4); // B, C, D, E
        });
        (0, vitest_1.it)("does not include the start node itself", () => {
            const result = graph.transitiveSuccessors("A");
            const ids = result.map((n) => n.id);
            (0, vitest_1.expect)(ids).not.toContain("A");
        });
    });
    (0, vitest_1.describe)("transitivePredecessors", () => {
        (0, vitest_1.beforeEach)(() => {
            // A → B → C → D
            ["A", "B", "C", "D"].forEach((id) => graph.addNode(makeNode(id)));
            graph.addEdge(makeEdge("A", "B"));
            graph.addEdge(makeEdge("B", "C"));
            graph.addEdge(makeEdge("C", "D"));
        });
        (0, vitest_1.it)("returns transitive predecessors", () => {
            const result = graph.transitivePredecessors("D");
            const ids = result.map((n) => n.id);
            (0, vitest_1.expect)(ids).toContain("C");
            (0, vitest_1.expect)(ids).toContain("B");
            (0, vitest_1.expect)(ids).toContain("A");
        });
        (0, vitest_1.it)("respects custom maxDepth", () => {
            const result = graph.transitivePredecessors("D", 1);
            const ids = result.map((n) => n.id);
            (0, vitest_1.expect)(ids).toEqual(["C"]);
        });
    });
    // --- Search ---
    (0, vitest_1.describe)("search", () => {
        (0, vitest_1.beforeEach)(() => {
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
        (0, vitest_1.it)("matches by id (path)", () => {
            const results = graph.search("auth");
            (0, vitest_1.expect)(results.some((n) => n.id === "src/auth/AuthService.ts")).toBe(true);
        });
        (0, vitest_1.it)("matches by name", () => {
            const results = graph.search("AuthService");
            (0, vitest_1.expect)(results).toHaveLength(1);
        });
        (0, vitest_1.it)("matches by summary", () => {
            const results = graph.search("JWT");
            (0, vitest_1.expect)(results).toHaveLength(1);
        });
        (0, vitest_1.it)("matches by tags", () => {
            const results = graph.search("database");
            (0, vitest_1.expect)(results.some((n) => n.id === "src/users/UserRepo.ts")).toBe(true);
        });
        (0, vitest_1.it)("returns empty for no match", () => {
            (0, vitest_1.expect)(graph.search("zzz_no_match")).toEqual([]);
        });
        (0, vitest_1.it)("is case-insensitive", () => {
            (0, vitest_1.expect)(graph.search("AUTHSERVICE")).toHaveLength(1);
        });
    });
    // --- Entry points ---
    (0, vitest_1.describe)("entryPoints", () => {
        (0, vitest_1.it)("returns nodes with no incoming edges", () => {
            graph.addNode(makeNode("main.ts"));
            graph.addNode(makeNode("util.ts"));
            graph.addEdge(makeEdge("main.ts", "util.ts"));
            const entry = graph.entryPoints();
            (0, vitest_1.expect)(entry).toHaveLength(1);
            (0, vitest_1.expect)(entry[0].id).toBe("main.ts");
        });
        (0, vitest_1.it)("excludes non-file nodes from entry points", () => {
            graph.addNode(makeNode("MyClass", { type: "class" }));
            const entry = graph.entryPoints();
            (0, vitest_1.expect)(entry).toHaveLength(0);
        });
    });
    // --- Stale tracking ---
    (0, vitest_1.describe)("markStale / staleNodes", () => {
        (0, vitest_1.beforeEach)(() => {
            // A → B (A imports B)
            graph.addNode(makeNode("A", { stale: false }));
            graph.addNode(makeNode("B", { stale: false }));
            graph.addEdge(makeEdge("A", "B"));
        });
        (0, vitest_1.it)("marks the node itself as stale", () => {
            graph.markStale("B");
            (0, vitest_1.expect)(graph.getNode("B").stale).toBe(true);
        });
        (0, vitest_1.it)("marks importers (predecessors) as stale", () => {
            graph.markStale("B");
            // A imports B, so A should also be stale
            (0, vitest_1.expect)(graph.getNode("A").stale).toBe(true);
        });
        (0, vitest_1.it)("staleNodes returns all stale nodes", () => {
            graph.markStale("B");
            const stale = graph.staleNodes();
            (0, vitest_1.expect)(stale).toHaveLength(2);
        });
        (0, vitest_1.it)("returns empty when nothing is stale", () => {
            (0, vitest_1.expect)(graph.staleNodes()).toHaveLength(0);
        });
    });
    // --- getRawGraph ---
    (0, vitest_1.describe)("getRawGraph", () => {
        (0, vitest_1.it)("returns the underlying graphology instance", () => {
            const raw = graph.getRawGraph();
            (0, vitest_1.expect)(raw).toBeDefined();
            (0, vitest_1.expect)(typeof raw.addNode).toBe("function");
        });
    });
});
//# sourceMappingURL=graph.test.js.map