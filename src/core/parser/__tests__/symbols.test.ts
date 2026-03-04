import { describe, it, expect, beforeEach } from "vitest";
import { CodeGraph, type GraphNode, type GraphEdge } from "../../graph/index.js";

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

describe("T2 — Symbol-level graph with contains edges", () => {
    let graph: CodeGraph;

    beforeEach(() => {
        graph = new CodeGraph();
    });

    describe("contains edges connect file → class → method", () => {
        beforeEach(() => {
            // File contains class, class contains methods
            graph.addNode(makeNode("src/auth.ts", { type: "file" }));
            graph.addNode(makeNode("src/auth.ts#AuthService", { type: "class", name: "AuthService" }));
            graph.addNode(makeNode("src/auth.ts#AuthService.login", { type: "function", name: "login" }));
            graph.addNode(makeNode("src/auth.ts#AuthService.logout", { type: "function", name: "logout" }));

            // File → class
            graph.addEdge({ source: "src/auth.ts", target: "src/auth.ts#AuthService", type: "contains", via: "contains class AuthService" });
            // Class → methods
            graph.addEdge({ source: "src/auth.ts#AuthService", target: "src/auth.ts#AuthService.login", type: "contains", via: "contains method login" });
            graph.addEdge({ source: "src/auth.ts#AuthService", target: "src/auth.ts#AuthService.logout", type: "contains", via: "contains method logout" });
        });

        it("stores contains edges", () => {
            const edges = graph.edges().filter((e) => e.type === "contains");
            expect(edges).toHaveLength(3);
        });

        it("successors of file include class", () => {
            const succs = graph.successors("src/auth.ts");
            expect(succs.some((n) => n.name === "AuthService")).toBe(true);
        });

        it("successors of class include methods", () => {
            const succs = graph.successors("src/auth.ts#AuthService");
            expect(succs.map((n) => n.name).sort()).toEqual(["login", "logout"]);
        });

        it("predecessors of method is the class", () => {
            const preds = graph.predecessors("src/auth.ts#AuthService.login");
            expect(preds).toHaveLength(1);
            expect(preds[0].name).toBe("AuthService");
        });

        it("transitive successors from file reach methods", () => {
            const result = graph.transitiveSuccessors("src/auth.ts", 2);
            const names = result.map((n) => n.name);
            expect(names).toContain("AuthService");
            expect(names).toContain("login");
            expect(names).toContain("logout");
        });

        it("search finds function by name", () => {
            const results = graph.search("login");
            expect(results).toHaveLength(1);
            expect(results[0].type).toBe("function");
        });

        it("search finds class by name", () => {
            const results = graph.search("AuthService");
            // Matches class + methods (their IDs contain 'AuthService')
            expect(results.length).toBeGreaterThanOrEqual(1);
            expect(results.some((n) => n.type === "class" && n.name === "AuthService")).toBe(true);
        });
    });

    describe("mixed imports + contains edges", () => {
        beforeEach(() => {
            // File A contains function foo
            graph.addNode(makeNode("a.ts", { type: "file" }));
            graph.addNode(makeNode("a.ts#foo", { type: "function", name: "foo" }));
            graph.addEdge({ source: "a.ts", target: "a.ts#foo", type: "contains", via: "contains function foo" });

            // File B imports A
            graph.addNode(makeNode("b.ts", { type: "file" }));
            graph.addEdge({ source: "b.ts", target: "a.ts", type: "imports", via: "import { foo } from './a'" });
        });

        it("import edges work alongside contains edges", () => {
            expect(graph.edgeCount()).toBe(2);
            const containsEdges = graph.edges().filter((e) => e.type === "contains");
            const importEdges = graph.edges().filter((e) => e.type === "imports");
            expect(containsEdges).toHaveLength(1);
            expect(importEdges).toHaveLength(1);
        });

        it("entryPoints only returns file nodes without incoming file-level imports", () => {
            const entries = graph.entryPoints();
            // b.ts is an entry point (no incoming imports), a.ts has incoming imports from b.ts
            // a.ts#foo is not an entry point (type=function, not file)
            expect(entries).toHaveLength(1);
            expect(entries[0].id).toBe("b.ts");
        });

        it("markStale on a.ts propagates to b.ts (importer) but not reverse", () => {
            graph.markStale("a.ts");
            expect(graph.getNode("a.ts")!.stale).toBe(true);
            expect(graph.getNode("b.ts")!.stale).toBe(true);  // b imports a
            expect(graph.getNode("a.ts#foo")!.stale).toBe(false); // foo is child, not importer
        });
    });
});
