"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const index_js_1 = require("../index.js");
const serializer_js_1 = require("../serializer.js");
function makeNode(id, overrides = {}) {
    return {
        id,
        type: "file",
        language: "typescript",
        path: id,
        name: id.split("/").pop() || id,
        lines: [1, 50],
        hash: `hash-${id}`,
        exports: ["foo"],
        stale: false,
        last_indexed: "2024-01-15T10:00:00.000Z",
        ...overrides,
    };
}
(0, vitest_1.describe)("Graph serializer", () => {
    let tmpDir;
    (0, vitest_1.beforeEach)(async () => {
        tmpDir = await promises_1.default.mkdtemp(path_1.default.join(os_1.default.tmpdir(), "ck-test-"));
    });
    (0, vitest_1.afterEach)(async () => {
        await promises_1.default.rm(tmpDir, { recursive: true, force: true });
    });
    (0, vitest_1.describe)("saveGraph / loadGraph round-trip", () => {
        (0, vitest_1.it)("saves and loads a graph preserving all nodes", async () => {
            const graph = new index_js_1.CodeGraph();
            graph.addNode(makeNode("src/a.ts", { summary: "Module A", tags: ["core"] }));
            graph.addNode(makeNode("src/b.ts", { summary: "Module B" }));
            graph.addEdge({ source: "src/a.ts", target: "src/b.ts", type: "imports", via: "import B" });
            await (0, serializer_js_1.saveGraph)(graph, tmpDir);
            const loaded = await (0, serializer_js_1.loadGraph)(tmpDir);
            (0, vitest_1.expect)(loaded).not.toBeNull();
            (0, vitest_1.expect)(loaded.nodeCount()).toBe(2);
            (0, vitest_1.expect)(loaded.edgeCount()).toBe(1);
            const nodeA = loaded.getNode("src/a.ts");
            (0, vitest_1.expect)(nodeA).toBeDefined();
            (0, vitest_1.expect)(nodeA.summary).toBe("Module A");
            (0, vitest_1.expect)(nodeA.tags).toEqual(["core"]);
            (0, vitest_1.expect)(nodeA.language).toBe("typescript");
        });
        (0, vitest_1.it)("preserves node hash and exports", async () => {
            const graph = new index_js_1.CodeGraph();
            graph.addNode(makeNode("src/a.ts", { hash: "abc123", exports: ["foo", "bar"] }));
            await (0, serializer_js_1.saveGraph)(graph, tmpDir);
            const loaded = await (0, serializer_js_1.loadGraph)(tmpDir);
            const node = loaded.getNode("src/a.ts");
            (0, vitest_1.expect)(node.hash).toBe("abc123");
            (0, vitest_1.expect)(node.exports).toEqual(["foo", "bar"]);
        });
        (0, vitest_1.it)("preserves edges with type and via", async () => {
            const graph = new index_js_1.CodeGraph();
            graph.addNode(makeNode("src/a.ts"));
            graph.addNode(makeNode("src/b.ts"));
            graph.addEdge({
                source: "src/a.ts",
                target: "src/b.ts",
                type: "imports",
                via: "import { foo } from './b'",
            });
            await (0, serializer_js_1.saveGraph)(graph, tmpDir);
            const loaded = await (0, serializer_js_1.loadGraph)(tmpDir);
            const edges = loaded.edges();
            (0, vitest_1.expect)(edges).toHaveLength(1);
            (0, vitest_1.expect)(edges[0].source).toBe("src/a.ts");
            (0, vitest_1.expect)(edges[0].target).toBe("src/b.ts");
            (0, vitest_1.expect)(edges[0].type).toBe("imports");
        });
        (0, vitest_1.it)("handles empty graph", async () => {
            const graph = new index_js_1.CodeGraph();
            await (0, serializer_js_1.saveGraph)(graph, tmpDir);
            const loaded = await (0, serializer_js_1.loadGraph)(tmpDir);
            (0, vitest_1.expect)(loaded).not.toBeNull();
            (0, vitest_1.expect)(loaded.nodeCount()).toBe(0);
        });
    });
    (0, vitest_1.describe)("loadGraph error handling", () => {
        (0, vitest_1.it)("returns null when no graph.json exists", async () => {
            const loaded = await (0, serializer_js_1.loadGraph)(tmpDir);
            (0, vitest_1.expect)(loaded).toBeNull();
        });
        (0, vitest_1.it)("returns null when graph.json is corrupted", async () => {
            await promises_1.default.writeFile(path_1.default.join(tmpDir, "graph.json"), "not valid json", "utf8");
            const loaded = await (0, serializer_js_1.loadGraph)(tmpDir);
            (0, vitest_1.expect)(loaded).toBeNull();
        });
    });
    (0, vitest_1.describe)("graphExists", () => {
        (0, vitest_1.it)("returns false when directory has no graph.json", async () => {
            const exists = await (0, serializer_js_1.graphExists)(tmpDir);
            (0, vitest_1.expect)(exists).toBe(false);
        });
        (0, vitest_1.it)("returns true after saving a graph", async () => {
            const graph = new index_js_1.CodeGraph();
            graph.addNode(makeNode("src/a.ts"));
            await (0, serializer_js_1.saveGraph)(graph, tmpDir);
            const exists = await (0, serializer_js_1.graphExists)(tmpDir);
            (0, vitest_1.expect)(exists).toBe(true);
        });
    });
    (0, vitest_1.describe)("graph.json format", () => {
        (0, vitest_1.it)("writes valid JSON with version field", async () => {
            const graph = new index_js_1.CodeGraph();
            graph.addNode(makeNode("src/a.ts"));
            await (0, serializer_js_1.saveGraph)(graph, tmpDir);
            const raw = await promises_1.default.readFile(path_1.default.join(tmpDir, "graph.json"), "utf8");
            const data = JSON.parse(raw);
            (0, vitest_1.expect)(data.version).toBe("1");
            (0, vitest_1.expect)(data.generated_at).toBeTruthy();
            (0, vitest_1.expect)(data.nodes).toBeInstanceOf(Array);
            (0, vitest_1.expect)(data.edges).toBeInstanceOf(Array);
        });
    });
});
//# sourceMappingURL=serializer.test.js.map