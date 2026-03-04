import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import { GraphStore } from "../index.js";
import { SCHEMA_VERSION } from "../schema.js";
import type { GraphNode, GraphEdge } from "../../graph/index.js";
import fs from "fs/promises";
import path from "path";
import os from "os";

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
        last_indexed: "2024-01-15T10:00:00.000Z",
        ...overrides,
    };
}

function makeEdge(source: string, target: string, type: GraphEdge["type"] = "imports"): GraphEdge {
    return { source, target, type, via: `${type} ${target}` };
}

describe("GraphStore — in-memory", () => {
    let store: GraphStore;

    beforeEach(async () => {
        store = await GraphStore.inMemory();
    });

    afterEach(() => {
        store.close();
    });

    // ── Schema ──

    it("reports correct schema version", () => {
        expect(store.schemaVersion()).toBe(SCHEMA_VERSION);
    });

    // ── Node CRUD ──

    describe("node operations", () => {
        it("upserts and retrieves a node", () => {
            const node = makeNode("src/a.ts", { summary: "Module A", tags: ["core"] });
            store.upsertNode(node);
            const retrieved = store.getNode("src/a.ts");
            expect(retrieved).toBeDefined();
            expect(retrieved!.id).toBe("src/a.ts");
            expect(retrieved!.summary).toBe("Module A");
            expect(retrieved!.tags).toEqual(["core"]);
            expect(retrieved!.language).toBe("typescript");
            expect(retrieved!.lines).toEqual([1, 50]);
        });

        it("returns undefined for non-existent node", () => {
            expect(store.getNode("nope")).toBeUndefined();
        });

        it("hasNode returns true/false correctly", () => {
            store.upsertNode(makeNode("src/a.ts"));
            expect(store.hasNode("src/a.ts")).toBe(true);
            expect(store.hasNode("nope")).toBe(false);
        });

        it("upsert replaces existing node", () => {
            store.upsertNode(makeNode("src/a.ts", { hash: "old" }));
            store.upsertNode(makeNode("src/a.ts", { hash: "new" }));
            expect(store.getNode("src/a.ts")!.hash).toBe("new");
            expect(store.nodeCount()).toBe(1);
        });

        it("removes a node and its edges", () => {
            store.upsertNode(makeNode("a.ts"));
            store.upsertNode(makeNode("b.ts"));
            store.upsertEdge(makeEdge("a.ts", "b.ts"));
            store.removeNode("a.ts");
            expect(store.hasNode("a.ts")).toBe(false);
            expect(store.edgeCount()).toBe(0);
        });

        it("updateNode merges partial attributes", () => {
            store.upsertNode(makeNode("src/a.ts"));
            store.updateNode("src/a.ts", { summary: "Updated", tags: ["new"] });
            const node = store.getNode("src/a.ts");
            expect(node!.summary).toBe("Updated");
            expect(node!.tags).toEqual(["new"]);
            expect(node!.language).toBe("typescript");
        });

        it("updateNode ignores non-existent node", () => {
            store.updateNode("nope", { summary: "test" });
            expect(store.nodeCount()).toBe(0);
        });

        it("nodeCount returns correct count", () => {
            expect(store.nodeCount()).toBe(0);
            store.upsertNode(makeNode("a.ts"));
            store.upsertNode(makeNode("b.ts"));
            expect(store.nodeCount()).toBe(2);
        });

        it("allNodes returns all nodes", () => {
            store.upsertNode(makeNode("a.ts"));
            store.upsertNode(makeNode("b.ts"));
            const nodes = store.allNodes();
            expect(nodes).toHaveLength(2);
        });

        it("nodesByType filters correctly", () => {
            store.upsertNode(makeNode("a.ts", { type: "file" }));
            store.upsertNode(makeNode("a.ts#Foo", { type: "class", name: "Foo" }));
            store.upsertNode(makeNode("a.ts#bar", { type: "function", name: "bar" }));
            expect(store.nodesByType("file")).toHaveLength(1);
            expect(store.nodesByType("class")).toHaveLength(1);
            expect(store.nodesByType("function")).toHaveLength(1);
        });

        it("preserves exports as JSON array", () => {
            store.upsertNode(makeNode("a.ts", { exports: ["foo", "bar", "Baz"] }));
            const node = store.getNode("a.ts");
            expect(node!.exports).toEqual(["foo", "bar", "Baz"]);
        });
    });

    // ── Stale tracking ──

    describe("stale tracking", () => {
        it("marks node as stale", () => {
            store.upsertNode(makeNode("a.ts", { stale: false }));
            store.markStale("a.ts");
            expect(store.getNode("a.ts")!.stale).toBe(true);
        });

        it("clears stale flag", () => {
            store.upsertNode(makeNode("a.ts", { stale: true }));
            store.clearStale("a.ts");
            expect(store.getNode("a.ts")!.stale).toBe(false);
        });

        it("staleNodes returns only stale nodes", () => {
            store.upsertNode(makeNode("a.ts", { stale: true }));
            store.upsertNode(makeNode("b.ts", { stale: false }));
            const stale = store.staleNodes();
            expect(stale).toHaveLength(1);
            expect(stale[0].id).toBe("a.ts");
        });
    });

    // ── Edge operations ──

    describe("edge operations", () => {
        it("upserts and retrieves edges", () => {
            store.upsertEdge(makeEdge("a.ts", "b.ts", "imports"));
            const edges = store.allEdges();
            expect(edges).toHaveLength(1);
            expect(edges[0].source).toBe("a.ts");
            expect(edges[0].target).toBe("b.ts");
            expect(edges[0].type).toBe("imports");
        });

        it("ignores duplicate edges (same source/target/type)", () => {
            store.upsertEdge(makeEdge("a.ts", "b.ts", "imports"));
            store.upsertEdge(makeEdge("a.ts", "b.ts", "imports"));
            expect(store.edgeCount()).toBe(1);
        });

        it("allows different edge types between same nodes", () => {
            store.upsertEdge(makeEdge("a.ts", "b.ts", "imports"));
            store.upsertEdge(makeEdge("a.ts", "b.ts", "calls"));
            expect(store.edgeCount()).toBe(2);
        });

        it("edgesFrom returns outgoing edges", () => {
            store.upsertEdge(makeEdge("a.ts", "b.ts"));
            store.upsertEdge(makeEdge("a.ts", "c.ts"));
            store.upsertEdge(makeEdge("b.ts", "c.ts"));
            const from = store.edgesFrom("a.ts");
            expect(from).toHaveLength(2);
        });

        it("edgesTo returns incoming edges", () => {
            store.upsertEdge(makeEdge("a.ts", "c.ts"));
            store.upsertEdge(makeEdge("b.ts", "c.ts"));
            const to = store.edgesTo("c.ts");
            expect(to).toHaveLength(2);
        });

        it("removeEdgesFor removes all edges involving a node", () => {
            store.upsertEdge(makeEdge("a.ts", "b.ts"));
            store.upsertEdge(makeEdge("b.ts", "c.ts"));
            store.removeEdgesFor("b.ts");
            expect(store.edgeCount()).toBe(0);
        });
    });

    // ── Bulk operations ──

    describe("bulk operations", () => {
        it("bulkUpsert inserts nodes and edges in transaction", () => {
            const nodes = [makeNode("a.ts"), makeNode("b.ts"), makeNode("c.ts")];
            const edges = [makeEdge("a.ts", "b.ts"), makeEdge("b.ts", "c.ts")];
            store.bulkUpsert(nodes, edges);
            expect(store.nodeCount()).toBe(3);
            expect(store.edgeCount()).toBe(2);
        });

        it("clear removes everything", () => {
            store.bulkUpsert(
                [makeNode("a.ts"), makeNode("b.ts")],
                [makeEdge("a.ts", "b.ts")]
            );
            store.clear();
            expect(store.nodeCount()).toBe(0);
            expect(store.edgeCount()).toBe(0);
        });
    });
});

describe("GraphStore — file persistence", () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ck-store-"));
    });

    afterEach(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it("saves to disk and loads back", async () => {
        // Write
        const store1 = await GraphStore.open(tmpDir);
        store1.upsertNode(makeNode("a.ts", { summary: "Module A", tags: ["core"] }));
        store1.upsertNode(makeNode("b.ts", { summary: "Module B" }));
        store1.upsertEdge(makeEdge("a.ts", "b.ts"));
        await store1.save();
        store1.close();

        // Read
        const store2 = await GraphStore.open(tmpDir);
        expect(store2.nodeCount()).toBe(2);
        expect(store2.edgeCount()).toBe(1);
        const nodeA = store2.getNode("a.ts");
        expect(nodeA!.summary).toBe("Module A");
        expect(nodeA!.tags).toEqual(["core"]);
        store2.close();
    });

    it("creates graph.db file", async () => {
        const store = await GraphStore.open(tmpDir);
        store.upsertNode(makeNode("a.ts"));
        await store.save();
        store.close();

        const exists = await fs.access(path.join(tmpDir, "graph.db")).then(() => true, () => false);
        expect(exists).toBe(true);
    });

    it("handles opening empty directory (creates fresh db)", async () => {
        const store = await GraphStore.open(tmpDir);
        expect(store.nodeCount()).toBe(0);
        expect(store.schemaVersion()).toBe(SCHEMA_VERSION);
        store.close();
    });

    it("preserves all node fields through save/load cycle", async () => {
        const store1 = await GraphStore.open(tmpDir);
        store1.upsertNode(
            makeNode("src/auth.ts", {
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
            })
        );
        await store1.save();
        store1.close();

        const store2 = await GraphStore.open(tmpDir);
        const node = store2.getNode("src/auth.ts");
        expect(node).toBeDefined();
        expect(node!.type).toBe("file");
        expect(node!.language).toBe("typescript");
        expect(node!.name).toBe("auth.ts");
        expect(node!.lines).toEqual([1, 100]);
        expect(node!.hash).toBe("abc123");
        expect(node!.exports).toEqual(["AuthService", "login"]);
        expect(node!.summary).toBe("Auth module");
        expect(node!.tags).toEqual(["auth", "security"]);
        expect(node!.stale).toBe(true);
        expect(node!.last_indexed).toBe("2025-01-01T00:00:00Z");
        store2.close();
    });
});
