"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const migrator_js_1 = require("../migrator.js");
const index_js_1 = require("../index.js");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
(0, vitest_1.describe)("Migrator — graph.json → SQLite", () => {
    let tmpDir;
    (0, vitest_1.beforeEach)(async () => {
        tmpDir = await promises_1.default.mkdtemp(path_1.default.join(os_1.default.tmpdir(), "ck-migrate-"));
    });
    (0, vitest_1.afterEach)(async () => {
        await promises_1.default.rm(tmpDir, { recursive: true, force: true });
    });
    (0, vitest_1.it)("migrates valid graph.json to SQLite", async () => {
        const json = {
            version: "1",
            generated_at: "2025-01-01T00:00:00Z",
            nodes: [
                {
                    id: "src/a.ts",
                    type: "file",
                    language: "typescript",
                    path: "src/a.ts",
                    name: "a.ts",
                    lines: [1, 50],
                    hash: "abc123",
                    exports: ["foo"],
                    summary: "Module A",
                    tags: ["core"],
                    stale: false,
                    last_indexed: "2025-01-01T00:00:00Z",
                },
                {
                    id: "src/b.ts",
                    type: "file",
                    language: "typescript",
                    path: "src/b.ts",
                    name: "b.ts",
                    lines: [1, 30],
                    hash: "def456",
                    exports: [],
                },
            ],
            edges: [
                { source: "src/a.ts", target: "src/b.ts", type: "imports", via: "import from './b'" },
            ],
        };
        await promises_1.default.writeFile(path_1.default.join(tmpDir, "graph.json"), JSON.stringify(json, null, 2), "utf8");
        const result = await (0, migrator_js_1.migrateJsonToSqlite)(tmpDir);
        (0, vitest_1.expect)(result.success).toBe(true);
        (0, vitest_1.expect)(result.nodeCount).toBe(2);
        (0, vitest_1.expect)(result.edgeCount).toBe(1);
        // Verify data in SQLite
        const store = await index_js_1.GraphStore.open(tmpDir);
        (0, vitest_1.expect)(store.nodeCount()).toBe(2);
        (0, vitest_1.expect)(store.edgeCount()).toBe(1);
        const nodeA = store.getNode("src/a.ts");
        (0, vitest_1.expect)(nodeA).toBeDefined();
        (0, vitest_1.expect)(nodeA.summary).toBe("Module A");
        (0, vitest_1.expect)(nodeA.tags).toEqual(["core"]);
        (0, vitest_1.expect)(nodeA.exports).toEqual(["foo"]);
        store.close();
    });
    (0, vitest_1.it)("returns error when graph.json not found", async () => {
        const result = await (0, migrator_js_1.migrateJsonToSqlite)(tmpDir);
        (0, vitest_1.expect)(result.success).toBe(false);
        (0, vitest_1.expect)(result.error).toContain("not found");
    });
    (0, vitest_1.it)("returns error for corrupted graph.json", async () => {
        await promises_1.default.writeFile(path_1.default.join(tmpDir, "graph.json"), "not json", "utf8");
        const result = await (0, migrator_js_1.migrateJsonToSqlite)(tmpDir);
        (0, vitest_1.expect)(result.success).toBe(false);
        (0, vitest_1.expect)(result.error).toContain("Failed to parse");
    });
    (0, vitest_1.it)("preserves stale flag through migration", async () => {
        const json = {
            version: "1",
            generated_at: "2025-01-01T00:00:00Z",
            nodes: [
                {
                    id: "a.ts",
                    type: "file",
                    language: "typescript",
                    path: "a.ts",
                    name: "a.ts",
                    lines: [1, 10],
                    hash: "h1",
                    stale: true,
                    last_indexed: "2025-01-01T00:00:00Z",
                },
            ],
            edges: [],
        };
        await promises_1.default.writeFile(path_1.default.join(tmpDir, "graph.json"), JSON.stringify(json), "utf8");
        await (0, migrator_js_1.migrateJsonToSqlite)(tmpDir);
        const store = await index_js_1.GraphStore.open(tmpDir);
        (0, vitest_1.expect)(store.getNode("a.ts").stale).toBe(true);
        store.close();
    });
    (0, vitest_1.it)("handles nodes without optional fields", async () => {
        const json = {
            version: "1",
            generated_at: "2025-01-01T00:00:00Z",
            nodes: [
                {
                    id: "a.ts",
                    type: "file",
                    language: "typescript",
                    path: "a.ts",
                    name: "a.ts",
                    lines: [1, 10],
                    hash: "h1",
                    // No exports, summary, tags, stale, last_indexed
                },
            ],
            edges: [],
        };
        await promises_1.default.writeFile(path_1.default.join(tmpDir, "graph.json"), JSON.stringify(json), "utf8");
        const result = await (0, migrator_js_1.migrateJsonToSqlite)(tmpDir);
        (0, vitest_1.expect)(result.success).toBe(true);
        const store = await index_js_1.GraphStore.open(tmpDir);
        const node = store.getNode("a.ts");
        (0, vitest_1.expect)(node).toBeDefined();
        (0, vitest_1.expect)(node.exports).toEqual([]);
        (0, vitest_1.expect)(node.tags).toEqual([]);
        (0, vitest_1.expect)(node.stale).toBe(false);
        store.close();
    });
});
//# sourceMappingURL=migrator.test.js.map