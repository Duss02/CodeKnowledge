"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const index_js_1 = require("../../graph/index.js");
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
(0, vitest_1.describe)("T2 — Symbol-level graph with contains edges", () => {
    let graph;
    (0, vitest_1.beforeEach)(() => {
        graph = new index_js_1.CodeGraph();
    });
    (0, vitest_1.describe)("contains edges connect file → class → method", () => {
        (0, vitest_1.beforeEach)(() => {
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
        (0, vitest_1.it)("stores contains edges", () => {
            const edges = graph.edges().filter((e) => e.type === "contains");
            (0, vitest_1.expect)(edges).toHaveLength(3);
        });
        (0, vitest_1.it)("successors of file include class", () => {
            const succs = graph.successors("src/auth.ts");
            (0, vitest_1.expect)(succs.some((n) => n.name === "AuthService")).toBe(true);
        });
        (0, vitest_1.it)("successors of class include methods", () => {
            const succs = graph.successors("src/auth.ts#AuthService");
            (0, vitest_1.expect)(succs.map((n) => n.name).sort()).toEqual(["login", "logout"]);
        });
        (0, vitest_1.it)("predecessors of method is the class", () => {
            const preds = graph.predecessors("src/auth.ts#AuthService.login");
            (0, vitest_1.expect)(preds).toHaveLength(1);
            (0, vitest_1.expect)(preds[0].name).toBe("AuthService");
        });
        (0, vitest_1.it)("transitive successors from file reach methods", () => {
            const result = graph.transitiveSuccessors("src/auth.ts", 2);
            const names = result.map((n) => n.name);
            (0, vitest_1.expect)(names).toContain("AuthService");
            (0, vitest_1.expect)(names).toContain("login");
            (0, vitest_1.expect)(names).toContain("logout");
        });
        (0, vitest_1.it)("search finds function by name", () => {
            const results = graph.search("login");
            (0, vitest_1.expect)(results).toHaveLength(1);
            (0, vitest_1.expect)(results[0].type).toBe("function");
        });
        (0, vitest_1.it)("search finds class by name", () => {
            const results = graph.search("AuthService");
            // Matches class + methods (their IDs contain 'AuthService')
            (0, vitest_1.expect)(results.length).toBeGreaterThanOrEqual(1);
            (0, vitest_1.expect)(results.some((n) => n.type === "class" && n.name === "AuthService")).toBe(true);
        });
    });
    (0, vitest_1.describe)("mixed imports + contains edges", () => {
        (0, vitest_1.beforeEach)(() => {
            // File A contains function foo
            graph.addNode(makeNode("a.ts", { type: "file" }));
            graph.addNode(makeNode("a.ts#foo", { type: "function", name: "foo" }));
            graph.addEdge({ source: "a.ts", target: "a.ts#foo", type: "contains", via: "contains function foo" });
            // File B imports A
            graph.addNode(makeNode("b.ts", { type: "file" }));
            graph.addEdge({ source: "b.ts", target: "a.ts", type: "imports", via: "import { foo } from './a'" });
        });
        (0, vitest_1.it)("import edges work alongside contains edges", () => {
            (0, vitest_1.expect)(graph.edgeCount()).toBe(2);
            const containsEdges = graph.edges().filter((e) => e.type === "contains");
            const importEdges = graph.edges().filter((e) => e.type === "imports");
            (0, vitest_1.expect)(containsEdges).toHaveLength(1);
            (0, vitest_1.expect)(importEdges).toHaveLength(1);
        });
        (0, vitest_1.it)("entryPoints only returns file nodes without incoming file-level imports", () => {
            const entries = graph.entryPoints();
            // b.ts is an entry point (no incoming imports), a.ts has incoming imports from b.ts
            // a.ts#foo is not an entry point (type=function, not file)
            (0, vitest_1.expect)(entries).toHaveLength(1);
            (0, vitest_1.expect)(entries[0].id).toBe("b.ts");
        });
        (0, vitest_1.it)("markStale on a.ts propagates to b.ts (importer) but not reverse", () => {
            graph.markStale("a.ts");
            (0, vitest_1.expect)(graph.getNode("a.ts").stale).toBe(true);
            (0, vitest_1.expect)(graph.getNode("b.ts").stale).toBe(true); // b imports a
            (0, vitest_1.expect)(graph.getNode("a.ts#foo").stale).toBe(false); // foo is child, not importer
        });
    });
});
//# sourceMappingURL=symbols.test.js.map