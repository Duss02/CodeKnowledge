import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { CodeGraph, type GraphNode } from "../index.js";
import { saveGraph, loadGraph, graphExists } from "../serializer.js";

function makeNode(id: string, overrides: Partial<GraphNode> = {}): GraphNode {
    return {
        id,
        type: "file",
        language: "typescript",
        path: id,
        name: id.split("/").pop() || id,
        lines: [1, 50] as [number, number],
        hash: `hash-${id}`,
        exports: ["foo"],
        stale: false,
        last_indexed: "2024-01-15T10:00:00.000Z",
        ...overrides,
    };
}

describe("Graph serializer", () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ck-test-"));
    });

    afterEach(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    describe("saveGraph / loadGraph round-trip", () => {
        it("saves and loads a graph preserving all nodes", async () => {
            const graph = new CodeGraph();
            graph.addNode(makeNode("src/a.ts", { summary: "Module A", tags: ["core"] }));
            graph.addNode(makeNode("src/b.ts", { summary: "Module B" }));
            graph.addEdge({ source: "src/a.ts", target: "src/b.ts", type: "imports", via: "import B" });

            await saveGraph(graph, tmpDir);
            const loaded = await loadGraph(tmpDir);

            expect(loaded).not.toBeNull();
            expect(loaded!.nodeCount()).toBe(2);
            expect(loaded!.edgeCount()).toBe(1);

            const nodeA = loaded!.getNode("src/a.ts");
            expect(nodeA).toBeDefined();
            expect(nodeA!.summary).toBe("Module A");
            expect(nodeA!.tags).toEqual(["core"]);
            expect(nodeA!.language).toBe("typescript");
        });

        it("preserves node hash and exports", async () => {
            const graph = new CodeGraph();
            graph.addNode(makeNode("src/a.ts", { hash: "abc123", exports: ["foo", "bar"] }));

            await saveGraph(graph, tmpDir);
            const loaded = await loadGraph(tmpDir);

            const node = loaded!.getNode("src/a.ts");
            expect(node!.hash).toBe("abc123");
            expect(node!.exports).toEqual(["foo", "bar"]);
        });

        it("preserves edges with type and via", async () => {
            const graph = new CodeGraph();
            graph.addNode(makeNode("src/a.ts"));
            graph.addNode(makeNode("src/b.ts"));
            graph.addEdge({
                source: "src/a.ts",
                target: "src/b.ts",
                type: "imports",
                via: "import { foo } from './b'",
            });

            await saveGraph(graph, tmpDir);
            const loaded = await loadGraph(tmpDir);
            const edges = loaded!.edges();
            expect(edges).toHaveLength(1);
            expect(edges[0].source).toBe("src/a.ts");
            expect(edges[0].target).toBe("src/b.ts");
            expect(edges[0].type).toBe("imports");
        });

        it("handles empty graph", async () => {
            const graph = new CodeGraph();
            await saveGraph(graph, tmpDir);
            const loaded = await loadGraph(tmpDir);
            expect(loaded).not.toBeNull();
            expect(loaded!.nodeCount()).toBe(0);
        });
    });

    describe("loadGraph error handling", () => {
        it("returns null when no graph.json exists", async () => {
            const loaded = await loadGraph(tmpDir);
            expect(loaded).toBeNull();
        });

        it("returns null when graph.json is corrupted", async () => {
            await fs.writeFile(path.join(tmpDir, "graph.json"), "not valid json", "utf8");
            const loaded = await loadGraph(tmpDir);
            expect(loaded).toBeNull();
        });
    });

    describe("graphExists", () => {
        it("returns false when directory has no graph.json", async () => {
            const exists = await graphExists(tmpDir);
            expect(exists).toBe(false);
        });

        it("returns true after saving a graph", async () => {
            const graph = new CodeGraph();
            graph.addNode(makeNode("src/a.ts"));
            await saveGraph(graph, tmpDir);
            const exists = await graphExists(tmpDir);
            expect(exists).toBe(true);
        });
    });

    describe("graph.json format", () => {
        it("writes valid JSON with version field", async () => {
            const graph = new CodeGraph();
            graph.addNode(makeNode("src/a.ts"));
            await saveGraph(graph, tmpDir);

            const raw = await fs.readFile(path.join(tmpDir, "graph.json"), "utf8");
            const data = JSON.parse(raw);
            expect(data.version).toBe("1");
            expect(data.generated_at).toBeTruthy();
            expect(data.nodes).toBeInstanceOf(Array);
            expect(data.edges).toBeInstanceOf(Array);
        });
    });
});
