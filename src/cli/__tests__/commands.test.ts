import { describe, it, expect } from "vitest";
import { runLanguages } from "../../cli/commands/languages.js";
import { estimateTokens } from "../../core/retrieval/index.js";
import {
    tokenize,
    buildVocabulary,
    toVector,
    ANNIndex,
} from "../../core/embedding/index.js";
import {
    structuralSearch,
    semanticSearch,
    hybridRetrieve,
} from "../../core/retrieval/index.js";
import { CodeGraph } from "../../core/graph/index.js";
import type { GraphNode } from "../../core/graph/index.js";

function makeNode(id: string, name: string, type: GraphNode["type"] = "file", extras: Partial<GraphNode> = {}): GraphNode {
    return {
        id, type, language: "typescript", path: id, name,
        lines: [1, 10] as [number, number], hash: `h-${id}`,
        exports: [], stale: false, last_indexed: new Date().toISOString(),
        ...extras,
    };
}

// ────────── T9: MCP ck_symbol ──────────

describe("T9 — ck_symbol integration (via graph search)", () => {
    it("finds symbols by name in graph", () => {
        const graph = new CodeGraph();
        graph.addNode(makeNode("src/auth.ts", "auth.ts", "file"));
        graph.addNode(makeNode("src/auth.ts::AuthService", "AuthService", "class"));
        graph.addNode(makeNode("src/auth.ts::login", "login", "function"));

        const query = "auth";
        const matches = graph.nodes().filter((n) =>
            n.name.toLowerCase().includes(query.toLowerCase())
        );
        expect(matches.length).toBeGreaterThanOrEqual(2);
        expect(matches.some((m) => m.name === "AuthService")).toBe(true);
    });

    it("filters symbols by type", () => {
        const graph = new CodeGraph();
        graph.addNode(makeNode("auth.ts", "auth.ts", "file"));
        graph.addNode(makeNode("AuthService", "AuthService", "class"));
        graph.addNode(makeNode("login", "login", "function"));

        const matches = graph.nodes().filter(
            (n) => n.name.toLowerCase().includes("auth") && n.type === "class"
        );
        expect(matches).toHaveLength(1);
        expect(matches[0].name).toBe("AuthService");
    });

    it("estimateTokens works for JSON output", () => {
        const json = JSON.stringify({ symbols: [{ id: "test" }] });
        const tokens = estimateTokens(json);
        expect(tokens).toBeGreaterThan(0);
        expect(tokens).toBe(Math.ceil(json.length / 4));
    });
});

// ────────── T10: CLI commands ──────────

describe("T10 — ck languages", () => {
    it("runs without error", () => {
        // Capture console.log output
        const logs: string[] = [];
        const origLog = console.log;
        console.log = (...args: any[]) => logs.push(args.join(" "));
        runLanguages();
        console.log = origLog;

        const output = logs.join("\n");
        expect(output).toContain("TypeScript");
        expect(output).toContain("Python");
        expect(output).toContain("Go");
        expect(output).toContain(".ts");
        expect(output).toContain(".py");
        expect(output).toContain(".go");
        expect(output).toContain("tree-sitter");
    });
});

describe("T10 — graph metrics (unit)", () => {
    it("computes correct node/edge counts", () => {
        const graph = new CodeGraph();
        graph.addNode(makeNode("a.ts", "a.ts", "file", { language: "typescript" as any }));
        graph.addNode(makeNode("b.ts", "b.ts", "file", { language: "python" as any }));
        graph.addNode(makeNode("c.ts", "c.ts", "class", { language: "typescript" as any }));
        graph.addEdge({ source: "a.ts", target: "b.ts", type: "imports", via: "" });
        graph.addEdge({ source: "a.ts", target: "c.ts", type: "contains", via: "" });

        const nodes = graph.nodes();
        const edges = graph.edges();
        expect(nodes.length).toBe(3);
        expect(edges.length).toBe(2);
        expect(nodes.filter((n) => n.type === "file").length).toBe(2);
        expect(nodes.filter((n) => n.type === "class").length).toBe(1);
        expect(edges.filter((e) => e.type === "imports").length).toBe(1);
        expect(edges.filter((e) => e.type === "contains").length).toBe(1);
    });
});

describe("T10 — ck export (unit)", () => {
    it("graph data can be serialized to JSON", () => {
        const graph = new CodeGraph();
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

        expect(json).toContain("a.ts");
        expect(json).toContain("imports");
        const parsed = JSON.parse(json);
        expect(parsed.stats.nodes).toBe(2);
        expect(parsed.stats.edges).toBe(1);
    });
});
