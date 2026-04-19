"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const index_js_1 = require("../index.js");
const schema_js_1 = require("../schema.js");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
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
        last_indexed: "2024-01-15T10:00:00.000Z",
        ...overrides,
    };
}
function makeEdge(source, target, type = "imports") {
    return { source, target, type, via: `${type} ${target}` };
}
(0, vitest_1.describe)("GraphStore — in-memory", () => {
    let store;
    (0, vitest_1.beforeEach)(async () => {
        store = await index_js_1.GraphStore.inMemory();
    });
    (0, vitest_1.afterEach)(() => {
        store.close();
    });
    // ── Schema ──
    (0, vitest_1.it)("reports correct schema version", () => {
        (0, vitest_1.expect)(store.schemaVersion()).toBe(schema_js_1.SCHEMA_VERSION);
    });
    // ── Node CRUD ──
    (0, vitest_1.describe)("node operations", () => {
        (0, vitest_1.it)("upserts and retrieves a node", () => {
            const node = makeNode("src/a.ts", { summary: "Module A", tags: ["core"] });
            store.upsertNode(node);
            const retrieved = store.getNode("src/a.ts");
            (0, vitest_1.expect)(retrieved).toBeDefined();
            (0, vitest_1.expect)(retrieved.id).toBe("src/a.ts");
            (0, vitest_1.expect)(retrieved.summary).toBe("Module A");
            (0, vitest_1.expect)(retrieved.tags).toEqual(["core"]);
            (0, vitest_1.expect)(retrieved.language).toBe("typescript");
            (0, vitest_1.expect)(retrieved.lines).toEqual([1, 50]);
        });
        (0, vitest_1.it)("returns undefined for non-existent node", () => {
            (0, vitest_1.expect)(store.getNode("nope")).toBeUndefined();
        });
        (0, vitest_1.it)("hasNode returns true/false correctly", () => {
            store.upsertNode(makeNode("src/a.ts"));
            (0, vitest_1.expect)(store.hasNode("src/a.ts")).toBe(true);
            (0, vitest_1.expect)(store.hasNode("nope")).toBe(false);
        });
        (0, vitest_1.it)("upsert replaces existing node", () => {
            store.upsertNode(makeNode("src/a.ts", { hash: "old" }));
            store.upsertNode(makeNode("src/a.ts", { hash: "new" }));
            (0, vitest_1.expect)(store.getNode("src/a.ts").hash).toBe("new");
            (0, vitest_1.expect)(store.nodeCount()).toBe(1);
        });
        (0, vitest_1.it)("removes a node and its edges", () => {
            store.upsertNode(makeNode("a.ts"));
            store.upsertNode(makeNode("b.ts"));
            store.upsertEdge(makeEdge("a.ts", "b.ts"));
            store.removeNode("a.ts");
            (0, vitest_1.expect)(store.hasNode("a.ts")).toBe(false);
            (0, vitest_1.expect)(store.edgeCount()).toBe(0);
        });
        (0, vitest_1.it)("updateNode merges partial attributes", () => {
            store.upsertNode(makeNode("src/a.ts"));
            store.updateNode("src/a.ts", { summary: "Updated", tags: ["new"] });
            const node = store.getNode("src/a.ts");
            (0, vitest_1.expect)(node.summary).toBe("Updated");
            (0, vitest_1.expect)(node.tags).toEqual(["new"]);
            (0, vitest_1.expect)(node.language).toBe("typescript");
        });
        (0, vitest_1.it)("updateNode ignores non-existent node", () => {
            store.updateNode("nope", { summary: "test" });
            (0, vitest_1.expect)(store.nodeCount()).toBe(0);
        });
        (0, vitest_1.it)("nodeCount returns correct count", () => {
            (0, vitest_1.expect)(store.nodeCount()).toBe(0);
            store.upsertNode(makeNode("a.ts"));
            store.upsertNode(makeNode("b.ts"));
            (0, vitest_1.expect)(store.nodeCount()).toBe(2);
        });
        (0, vitest_1.it)("allNodes returns all nodes", () => {
            store.upsertNode(makeNode("a.ts"));
            store.upsertNode(makeNode("b.ts"));
            const nodes = store.allNodes();
            (0, vitest_1.expect)(nodes).toHaveLength(2);
        });
        (0, vitest_1.it)("nodesByType filters correctly", () => {
            store.upsertNode(makeNode("a.ts", { type: "file" }));
            store.upsertNode(makeNode("a.ts#Foo", { type: "class", name: "Foo" }));
            store.upsertNode(makeNode("a.ts#bar", { type: "function", name: "bar" }));
            (0, vitest_1.expect)(store.nodesByType("file")).toHaveLength(1);
            (0, vitest_1.expect)(store.nodesByType("class")).toHaveLength(1);
            (0, vitest_1.expect)(store.nodesByType("function")).toHaveLength(1);
        });
        (0, vitest_1.it)("preserves exports as JSON array", () => {
            store.upsertNode(makeNode("a.ts", { exports: ["foo", "bar", "Baz"] }));
            const node = store.getNode("a.ts");
            (0, vitest_1.expect)(node.exports).toEqual(["foo", "bar", "Baz"]);
        });
    });
    // ── Stale tracking ──
    (0, vitest_1.describe)("stale tracking", () => {
        (0, vitest_1.it)("marks node as stale", () => {
            store.upsertNode(makeNode("a.ts", { stale: false }));
            store.markStale("a.ts");
            (0, vitest_1.expect)(store.getNode("a.ts").stale).toBe(true);
        });
        (0, vitest_1.it)("clears stale flag", () => {
            store.upsertNode(makeNode("a.ts", { stale: true }));
            store.clearStale("a.ts");
            (0, vitest_1.expect)(store.getNode("a.ts").stale).toBe(false);
        });
        (0, vitest_1.it)("staleNodes returns only stale nodes", () => {
            store.upsertNode(makeNode("a.ts", { stale: true }));
            store.upsertNode(makeNode("b.ts", { stale: false }));
            const stale = store.staleNodes();
            (0, vitest_1.expect)(stale).toHaveLength(1);
            (0, vitest_1.expect)(stale[0].id).toBe("a.ts");
        });
    });
    // ── Edge operations ──
    (0, vitest_1.describe)("edge operations", () => {
        (0, vitest_1.it)("upserts and retrieves edges", () => {
            store.upsertEdge(makeEdge("a.ts", "b.ts", "imports"));
            const edges = store.allEdges();
            (0, vitest_1.expect)(edges).toHaveLength(1);
            (0, vitest_1.expect)(edges[0].source).toBe("a.ts");
            (0, vitest_1.expect)(edges[0].target).toBe("b.ts");
            (0, vitest_1.expect)(edges[0].type).toBe("imports");
        });
        (0, vitest_1.it)("ignores duplicate edges (same source/target/type)", () => {
            store.upsertEdge(makeEdge("a.ts", "b.ts", "imports"));
            store.upsertEdge(makeEdge("a.ts", "b.ts", "imports"));
            (0, vitest_1.expect)(store.edgeCount()).toBe(1);
        });
        (0, vitest_1.it)("allows different edge types between same nodes", () => {
            store.upsertEdge(makeEdge("a.ts", "b.ts", "imports"));
            store.upsertEdge(makeEdge("a.ts", "b.ts", "calls"));
            (0, vitest_1.expect)(store.edgeCount()).toBe(2);
        });
        (0, vitest_1.it)("edgesFrom returns outgoing edges", () => {
            store.upsertEdge(makeEdge("a.ts", "b.ts"));
            store.upsertEdge(makeEdge("a.ts", "c.ts"));
            store.upsertEdge(makeEdge("b.ts", "c.ts"));
            const from = store.edgesFrom("a.ts");
            (0, vitest_1.expect)(from).toHaveLength(2);
        });
        (0, vitest_1.it)("edgesTo returns incoming edges", () => {
            store.upsertEdge(makeEdge("a.ts", "c.ts"));
            store.upsertEdge(makeEdge("b.ts", "c.ts"));
            const to = store.edgesTo("c.ts");
            (0, vitest_1.expect)(to).toHaveLength(2);
        });
        (0, vitest_1.it)("removeEdgesFor removes all edges involving a node", () => {
            store.upsertEdge(makeEdge("a.ts", "b.ts"));
            store.upsertEdge(makeEdge("b.ts", "c.ts"));
            store.removeEdgesFor("b.ts");
            (0, vitest_1.expect)(store.edgeCount()).toBe(0);
        });
    });
    // ── Bulk operations ──
    (0, vitest_1.describe)("bulk operations", () => {
        (0, vitest_1.it)("bulkUpsert inserts nodes and edges in transaction", () => {
            const nodes = [makeNode("a.ts"), makeNode("b.ts"), makeNode("c.ts")];
            const edges = [makeEdge("a.ts", "b.ts"), makeEdge("b.ts", "c.ts")];
            store.bulkUpsert(nodes, edges);
            (0, vitest_1.expect)(store.nodeCount()).toBe(3);
            (0, vitest_1.expect)(store.edgeCount()).toBe(2);
        });
        (0, vitest_1.it)("clear removes everything", () => {
            store.bulkUpsert([makeNode("a.ts"), makeNode("b.ts")], [makeEdge("a.ts", "b.ts")]);
            store.clear();
            (0, vitest_1.expect)(store.nodeCount()).toBe(0);
            (0, vitest_1.expect)(store.edgeCount()).toBe(0);
        });
    });
});
(0, vitest_1.describe)("GraphStore — file persistence", () => {
    let tmpDir;
    (0, vitest_1.beforeEach)(async () => {
        tmpDir = await promises_1.default.mkdtemp(path_1.default.join(os_1.default.tmpdir(), "ck-store-"));
    });
    (0, vitest_1.afterEach)(async () => {
        await promises_1.default.rm(tmpDir, { recursive: true, force: true });
    });
    (0, vitest_1.it)("saves to disk and loads back", async () => {
        // Write
        const store1 = await index_js_1.GraphStore.open(tmpDir);
        store1.upsertNode(makeNode("a.ts", { summary: "Module A", tags: ["core"] }));
        store1.upsertNode(makeNode("b.ts", { summary: "Module B" }));
        store1.upsertEdge(makeEdge("a.ts", "b.ts"));
        await store1.save();
        store1.close();
        // Read
        const store2 = await index_js_1.GraphStore.open(tmpDir);
        (0, vitest_1.expect)(store2.nodeCount()).toBe(2);
        (0, vitest_1.expect)(store2.edgeCount()).toBe(1);
        const nodeA = store2.getNode("a.ts");
        (0, vitest_1.expect)(nodeA.summary).toBe("Module A");
        (0, vitest_1.expect)(nodeA.tags).toEqual(["core"]);
        store2.close();
    });
    (0, vitest_1.it)("creates graph.db file", async () => {
        const store = await index_js_1.GraphStore.open(tmpDir);
        store.upsertNode(makeNode("a.ts"));
        await store.save();
        store.close();
        const exists = await promises_1.default.access(path_1.default.join(tmpDir, "graph.db")).then(() => true, () => false);
        (0, vitest_1.expect)(exists).toBe(true);
    });
    (0, vitest_1.it)("handles opening empty directory (creates fresh db)", async () => {
        const store = await index_js_1.GraphStore.open(tmpDir);
        (0, vitest_1.expect)(store.nodeCount()).toBe(0);
        (0, vitest_1.expect)(store.schemaVersion()).toBe(schema_js_1.SCHEMA_VERSION);
        store.close();
    });
    (0, vitest_1.it)("preserves all node fields through save/load cycle", async () => {
        const store1 = await index_js_1.GraphStore.open(tmpDir);
        store1.upsertNode(makeNode("src/auth.ts", {
            type: "file",
            language: "typescript",
            name: "auth.ts",
            lines: [1, 100],
            hash: "abc123",
            exports: ["AuthService", "login"],
            summary: "Auth module",
            tags: ["auth", "security"],
            stale: true,
            last_indexed: "2025-01-01T00:00:00Z",
        }));
        await store1.save();
        store1.close();
        const store2 = await index_js_1.GraphStore.open(tmpDir);
        const node = store2.getNode("src/auth.ts");
        (0, vitest_1.expect)(node).toBeDefined();
        (0, vitest_1.expect)(node.type).toBe("file");
        (0, vitest_1.expect)(node.language).toBe("typescript");
        (0, vitest_1.expect)(node.name).toBe("auth.ts");
        (0, vitest_1.expect)(node.lines).toEqual([1, 100]);
        (0, vitest_1.expect)(node.hash).toBe("abc123");
        (0, vitest_1.expect)(node.exports).toEqual(["AuthService", "login"]);
        (0, vitest_1.expect)(node.summary).toBe("Auth module");
        (0, vitest_1.expect)(node.tags).toEqual(["auth", "security"]);
        (0, vitest_1.expect)(node.stale).toBe(true);
        (0, vitest_1.expect)(node.last_indexed).toBe("2025-01-01T00:00:00Z");
        store2.close();
    });
});
//# sourceMappingURL=store.test.js.map