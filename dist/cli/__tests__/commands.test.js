"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const languages_js_1 = require("../../cli/commands/languages.js");
const index_js_1 = require("../../core/retrieval/index.js");
const index_js_2 = require("../../core/graph/index.js");
function makeNode(id, name, type = "file", extras = {}) {
    return {
        id, type, language: "typescript", path: id, name,
        lines: [1, 10], hash: `h-${id}`,
        exports: [], stale: false, last_indexed: new Date().toISOString(),
        ...extras,
    };
}
// ────────── T9: MCP ck_symbol ──────────
(0, vitest_1.describe)("T9 — ck_symbol integration (via graph search)", () => {
    (0, vitest_1.it)("finds symbols by name in graph", () => {
        const graph = new index_js_2.CodeGraph();
        graph.addNode(makeNode("src/auth.ts", "auth.ts", "file"));
        graph.addNode(makeNode("src/auth.ts::AuthService", "AuthService", "class"));
        graph.addNode(makeNode("src/auth.ts::login", "login", "function"));
        const query = "auth";
        const matches = graph.nodes().filter((n) => n.name.toLowerCase().includes(query.toLowerCase()));
        (0, vitest_1.expect)(matches.length).toBeGreaterThanOrEqual(2);
        (0, vitest_1.expect)(matches.some((m) => m.name === "AuthService")).toBe(true);
    });
    (0, vitest_1.it)("filters symbols by type", () => {
        const graph = new index_js_2.CodeGraph();
        graph.addNode(makeNode("auth.ts", "auth.ts", "file"));
        graph.addNode(makeNode("AuthService", "AuthService", "class"));
        graph.addNode(makeNode("login", "login", "function"));
        const matches = graph.nodes().filter((n) => n.name.toLowerCase().includes("auth") && n.type === "class");
        (0, vitest_1.expect)(matches).toHaveLength(1);
        (0, vitest_1.expect)(matches[0].name).toBe("AuthService");
    });
    (0, vitest_1.it)("estimateTokens works for JSON output", () => {
        const json = JSON.stringify({ symbols: [{ id: "test" }] });
        const tokens = (0, index_js_1.estimateTokens)(json);
        (0, vitest_1.expect)(tokens).toBeGreaterThan(0);
        (0, vitest_1.expect)(tokens).toBe(Math.ceil(json.length / 4));
    });
});
// ────────── T10: CLI commands ──────────
(0, vitest_1.describe)("T10 — ck languages", () => {
    (0, vitest_1.it)("runs without error", () => {
        // Capture console.log output
        const logs = [];
        const origLog = console.log;
        console.log = (...args) => logs.push(args.join(" "));
        (0, languages_js_1.runLanguages)();
        console.log = origLog;
        const output = logs.join("\n");
        (0, vitest_1.expect)(output).toContain("TypeScript");
        (0, vitest_1.expect)(output).toContain("Python");
        (0, vitest_1.expect)(output).toContain("Go");
        (0, vitest_1.expect)(output).toContain(".ts");
        (0, vitest_1.expect)(output).toContain(".py");
        (0, vitest_1.expect)(output).toContain(".go");
        (0, vitest_1.expect)(output).toContain("tree-sitter");
    });
});
(0, vitest_1.describe)("T10 — graph metrics (unit)", () => {
    (0, vitest_1.it)("computes correct node/edge counts", () => {
        const graph = new index_js_2.CodeGraph();
        graph.addNode(makeNode("a.ts", "a.ts", "file", { language: "typescript" }));
        graph.addNode(makeNode("b.ts", "b.ts", "file", { language: "python" }));
        graph.addNode(makeNode("c.ts", "c.ts", "class", { language: "typescript" }));
        graph.addEdge({ source: "a.ts", target: "b.ts", type: "imports", via: "" });
        graph.addEdge({ source: "a.ts", target: "c.ts", type: "contains", via: "" });
        const nodes = graph.nodes();
        const edges = graph.edges();
        (0, vitest_1.expect)(nodes.length).toBe(3);
        (0, vitest_1.expect)(edges.length).toBe(2);
        (0, vitest_1.expect)(nodes.filter((n) => n.type === "file").length).toBe(2);
        (0, vitest_1.expect)(nodes.filter((n) => n.type === "class").length).toBe(1);
        (0, vitest_1.expect)(edges.filter((e) => e.type === "imports").length).toBe(1);
        (0, vitest_1.expect)(edges.filter((e) => e.type === "contains").length).toBe(1);
    });
});
(0, vitest_1.describe)("T10 — ck export (unit)", () => {
    (0, vitest_1.it)("graph data can be serialized to JSON", () => {
        const graph = new index_js_2.CodeGraph();
        graph.addNode(makeNode("a.ts", "a.ts", "file", { summary: "test file" }));
        graph.addNode(makeNode("b.ts", "b.ts", "file"));
        graph.addEdge({ source: "a.ts", target: "b.ts", type: "imports", via: "b" });
        const data = {
            version: "2",
            stats: { nodes: graph.nodeCount(), edges: graph.edgeCount() },
            nodes: graph.nodes().map((n) => ({ id: n.id, type: n.type, name: n.name })),
            edges: graph.edges().map((e) => ({ source: e.source, target: e.target, type: e.type })),
        };
        const json = JSON.stringify(data);
        (0, vitest_1.expect)(json).toContain("a.ts");
        (0, vitest_1.expect)(json).toContain("imports");
        const parsed = JSON.parse(json);
        (0, vitest_1.expect)(parsed.stats.nodes).toBe(2);
        (0, vitest_1.expect)(parsed.stats.edges).toBe(1);
    });
});
//# sourceMappingURL=commands.test.js.map