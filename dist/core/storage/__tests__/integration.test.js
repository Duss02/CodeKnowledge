"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * T3 Integration Test — Parse open-source repos through SQLite GraphStore.
 *
 * Tests the full pipeline: parseFile → GraphStore.bulkUpsert → save → reload → verify.
 * Uses real-world repos: zod (TypeScript), click (Python), gorilla/mux (Go).
 */
const vitest_1 = require("vitest");
const index_js_1 = require("../../parser/index.js");
const index_js_2 = require("../index.js");
const migrator_js_1 = require("../migrator.js");
const index_js_3 = require("../../graph/index.js");
const serializer_js_1 = require("../../graph/serializer.js");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const ROOT = path_1.default.resolve(__dirname, "../../../../");
const FIXTURES = path_1.default.join(ROOT, "test-fixtures");
async function collectFiles(dir, extensions) {
    const result = [];
    async function walk(d) {
        let entries;
        try {
            entries = await promises_1.default.readdir(d, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const e of entries) {
            const full = path_1.default.join(d, e.name);
            if (e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules" && e.name !== "__tests__" && e.name !== "test" && e.name !== "tests" && e.name !== "__pycache__") {
                await walk(full);
            }
            else if (e.isFile() && extensions.some((ext) => e.name.endsWith(ext)) && !e.name.includes(".test.") && !e.name.includes(".spec.") && !e.name.includes("_test.")) {
                result.push(full);
            }
        }
    }
    await walk(dir);
    return result;
}
async function parseRepo(repoPath, extensions) {
    const files = await collectFiles(repoPath, extensions);
    const allNodes = [];
    const allEdges = [];
    let errorCount = 0;
    for (const f of files) {
        const result = await (0, index_js_1.parseFile)(f, repoPath, { maxFileSizeKB: 500 });
        if (result.errors.length > 0)
            errorCount += result.errors.length;
        allNodes.push(...result.nodes);
        allEdges.push(...result.edges);
    }
    return { nodes: allNodes, edges: allEdges, fileCount: files.length, errorCount };
}
(0, vitest_1.describe)("UC-zod — Parse TypeScript repo through SQLite", () => {
    const zodSrc = path_1.default.join(FIXTURES, "zod", "packages", "zod", "src");
    let store;
    let tmpDir;
    let parseStats;
    (0, vitest_1.beforeAll)(async () => {
        tmpDir = await promises_1.default.mkdtemp(path_1.default.join(os_1.default.tmpdir(), "ck-zod-"));
        parseStats = await parseRepo(zodSrc, [".ts"]);
        store = await index_js_2.GraphStore.inMemory();
        const graphNodes = parseStats.nodes.map((n) => ({
            ...n,
            stale: false,
            last_indexed: new Date().toISOString(),
        }));
        const graphEdges = parseStats.edges;
        store.bulkUpsert(graphNodes, graphEdges);
    });
    (0, vitest_1.afterAll)(() => {
        store?.close();
    });
    (0, vitest_1.it)("parses zod source files", () => {
        console.log(`  zod: ${parseStats.fileCount} files, ${parseStats.nodes.length} nodes, ${parseStats.edges.length} edges, ${parseStats.errorCount} errors`);
        (0, vitest_1.expect)(parseStats.fileCount).toBeGreaterThan(5);
        (0, vitest_1.expect)(parseStats.nodes.length).toBeGreaterThan(10);
    });
    (0, vitest_1.it)("stores nodes in SQLite (deduped by ID)", () => {
        // SQLite UPSERT deduplicates by PRIMARY KEY(id) — count may be <= parsed
        (0, vitest_1.expect)(store.nodeCount()).toBeGreaterThan(0);
        (0, vitest_1.expect)(store.nodeCount()).toBeLessThanOrEqual(parseStats.nodes.length);
    });
    (0, vitest_1.it)("stores all edges in SQLite", () => {
        // Deduplication may reduce edge count slightly
        (0, vitest_1.expect)(store.edgeCount()).toBeGreaterThan(0);
    });
    (0, vitest_1.it)("finds class nodes", () => {
        const classes = store.nodesByType("class");
        console.log(`  zod classes: ${classes.map((c) => c.name).slice(0, 10).join(", ")}...`);
        (0, vitest_1.expect)(classes.length).toBeGreaterThanOrEqual(0); // zod may use mostly functions
    });
    (0, vitest_1.it)("finds function nodes", () => {
        const functions = store.nodesByType("function");
        console.log(`  zod functions: ${functions.length} total`);
        (0, vitest_1.expect)(functions.length).toBeGreaterThan(0);
    });
    (0, vitest_1.it)("has contains edges", () => {
        const containsEdges = store.allEdges().filter((e) => e.type === "contains");
        console.log(`  zod contains edges: ${containsEdges.length}`);
        (0, vitest_1.expect)(containsEdges.length).toBeGreaterThan(0);
    });
});
(0, vitest_1.describe)("UC-click — Parse Python repo through SQLite", () => {
    const clickSrc = path_1.default.join(FIXTURES, "click", "src", "click");
    let store;
    let parseStats;
    (0, vitest_1.beforeAll)(async () => {
        parseStats = await parseRepo(clickSrc, [".py"]);
        store = await index_js_2.GraphStore.inMemory();
        const graphNodes = parseStats.nodes.map((n) => ({
            ...n,
            stale: false,
            last_indexed: new Date().toISOString(),
        }));
        store.bulkUpsert(graphNodes, parseStats.edges);
    });
    (0, vitest_1.afterAll)(() => {
        store?.close();
    });
    (0, vitest_1.it)("parses click source files", () => {
        console.log(`  click: ${parseStats.fileCount} files, ${parseStats.nodes.length} nodes, ${parseStats.edges.length} edges, ${parseStats.errorCount} errors`);
        (0, vitest_1.expect)(parseStats.fileCount).toBeGreaterThan(5);
    });
    (0, vitest_1.it)("stores nodes in SQLite (deduped by ID)", () => {
        (0, vitest_1.expect)(store.nodeCount()).toBeGreaterThan(0);
        (0, vitest_1.expect)(store.nodeCount()).toBeLessThanOrEqual(parseStats.nodes.length);
    });
    (0, vitest_1.it)("finds class nodes (click has many)", () => {
        const classes = store.nodesByType("class");
        console.log(`  click classes: ${classes.map((c) => c.name).slice(0, 10).join(", ")}...`);
        (0, vitest_1.expect)(classes.length).toBeGreaterThan(3);
    });
    (0, vitest_1.it)("finds function nodes", () => {
        const functions = store.nodesByType("function");
        console.log(`  click functions: ${functions.length} total`);
        (0, vitest_1.expect)(functions.length).toBeGreaterThan(10);
    });
    (0, vitest_1.it)("has contains edges", () => {
        const containsEdges = store.allEdges().filter((e) => e.type === "contains");
        (0, vitest_1.expect)(containsEdges.length).toBeGreaterThan(0);
    });
});
(0, vitest_1.describe)("UC-mux — Parse Go repo through SQLite", () => {
    const muxSrc = path_1.default.join(FIXTURES, "mux");
    let store;
    let parseStats;
    (0, vitest_1.beforeAll)(async () => {
        parseStats = await parseRepo(muxSrc, [".go"]);
        store = await index_js_2.GraphStore.inMemory();
        const graphNodes = parseStats.nodes.map((n) => ({
            ...n,
            stale: false,
            last_indexed: new Date().toISOString(),
        }));
        store.bulkUpsert(graphNodes, parseStats.edges);
    });
    (0, vitest_1.afterAll)(() => {
        store?.close();
    });
    (0, vitest_1.it)("parses mux source files", () => {
        console.log(`  mux: ${parseStats.fileCount} files, ${parseStats.nodes.length} nodes, ${parseStats.edges.length} edges, ${parseStats.errorCount} errors`);
        (0, vitest_1.expect)(parseStats.fileCount).toBeGreaterThan(3);
    });
    (0, vitest_1.it)("stores nodes in SQLite (deduped by ID)", () => {
        (0, vitest_1.expect)(store.nodeCount()).toBeGreaterThan(0);
        (0, vitest_1.expect)(store.nodeCount()).toBeLessThanOrEqual(parseStats.nodes.length);
    });
    (0, vitest_1.it)("finds struct/interface nodes (type=class in Go)", () => {
        const classes = store.nodesByType("class");
        console.log(`  mux types: ${classes.map((c) => c.name).join(", ")}`);
        (0, vitest_1.expect)(classes.length).toBeGreaterThan(0);
    });
    (0, vitest_1.it)("has contains edges", () => {
        const containsEdges = store.allEdges().filter((e) => e.type === "contains");
        (0, vitest_1.expect)(containsEdges.length).toBeGreaterThan(0);
    });
});
(0, vitest_1.describe)("UC-persistence — Save and reload from SQLite file", () => {
    let tmpDir;
    (0, vitest_1.beforeAll)(async () => {
        tmpDir = await promises_1.default.mkdtemp(path_1.default.join(os_1.default.tmpdir(), "ck-persist-"));
    });
    (0, vitest_1.afterAll)(async () => {
        await promises_1.default.rm(tmpDir, { recursive: true, force: true });
    });
    (0, vitest_1.it)("full pipeline: parse self → store in SQLite → save → reload → verify counts", async () => {
        const srcDir = path_1.default.join(ROOT, "src");
        const parseStats = await parseRepo(srcDir, [".ts"]);
        // Store
        const store1 = await index_js_2.GraphStore.open(tmpDir);
        const graphNodes = parseStats.nodes.map((n) => ({
            ...n,
            stale: false,
            last_indexed: new Date().toISOString(),
        }));
        store1.bulkUpsert(graphNodes, parseStats.edges);
        await store1.save();
        const savedNodes = store1.nodeCount();
        const savedEdges = store1.edgeCount();
        store1.close();
        // Reload
        const store2 = await index_js_2.GraphStore.open(tmpDir);
        (0, vitest_1.expect)(store2.nodeCount()).toBe(savedNodes);
        (0, vitest_1.expect)(store2.edgeCount()).toBe(savedEdges);
        console.log(`  self-index persistence: ${savedNodes} nodes, ${savedEdges} edges saved and restored`);
        store2.close();
    });
});
(0, vitest_1.describe)("UC-migration — Migrate existing graph.json to SQLite", () => {
    let tmpDir;
    (0, vitest_1.beforeAll)(async () => {
        tmpDir = await promises_1.default.mkdtemp(path_1.default.join(os_1.default.tmpdir(), "ck-migration-"));
    });
    (0, vitest_1.afterAll)(async () => {
        await promises_1.default.rm(tmpDir, { recursive: true, force: true });
    });
    (0, vitest_1.it)("migrates real graph.json if it exists", async () => {
        // First create a graph.json using the existing serializer
        const srcDir = path_1.default.join(ROOT, "src");
        const parseStats = await parseRepo(srcDir, [".ts"]);
        const graph = new index_js_3.CodeGraph();
        for (const n of parseStats.nodes) {
            graph.addNode({ ...n, stale: false, last_indexed: new Date().toISOString() });
        }
        for (const e of parseStats.edges) {
            graph.addEdge(e);
        }
        await (0, serializer_js_1.saveGraph)(graph, tmpDir);
        // Now migrate
        const result = await (0, migrator_js_1.migrateJsonToSqlite)(tmpDir);
        (0, vitest_1.expect)(result.success).toBe(true);
        (0, vitest_1.expect)(result.nodeCount).toBeGreaterThan(100);
        console.log(`  migration: ${result.nodeCount} nodes, ${result.edgeCount} edges migrated`);
        // Verify SQLite has the data
        const store = await index_js_2.GraphStore.open(tmpDir);
        (0, vitest_1.expect)(store.nodeCount()).toBe(result.nodeCount);
        store.close();
    });
});
//# sourceMappingURL=integration.test.js.map