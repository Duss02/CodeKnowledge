import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { migrateJsonToSqlite } from "../migrator.js";
import { GraphStore } from "../index.js";
import fs from "fs/promises";
import path from "path";
import os from "os";

describe("Migrator — graph.json → SQLite", () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ck-migrate-"));
    });

    afterEach(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it("migrates valid graph.json to SQLite", async () => {
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
        await fs.writeFile(
            path.join(tmpDir, "graph.json"),
            JSON.stringify(json, null, 2),
            "utf8"
        );

        const result = await migrateJsonToSqlite(tmpDir);
        expect(result.success).toBe(true);
        expect(result.nodeCount).toBe(2);
        expect(result.edgeCount).toBe(1);

        // Verify data in SQLite
        const store = await GraphStore.open(tmpDir);
        expect(store.nodeCount()).toBe(2);
        expect(store.edgeCount()).toBe(1);
        const nodeA = store.getNode("src/a.ts");
        expect(nodeA).toBeDefined();
        expect(nodeA!.summary).toBe("Module A");
        expect(nodeA!.tags).toEqual(["core"]);
        expect(nodeA!.exports).toEqual(["foo"]);
        store.close();
    });

    it("returns error when graph.json not found", async () => {
        const result = await migrateJsonToSqlite(tmpDir);
        expect(result.success).toBe(false);
        expect(result.error).toContain("not found");
    });

    it("returns error for corrupted graph.json", async () => {
        await fs.writeFile(path.join(tmpDir, "graph.json"), "not json", "utf8");
        const result = await migrateJsonToSqlite(tmpDir);
        expect(result.success).toBe(false);
        expect(result.error).toContain("Failed to parse");
    });

    it("preserves stale flag through migration", async () => {
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
        await fs.writeFile(path.join(tmpDir, "graph.json"), JSON.stringify(json), "utf8");
        await migrateJsonToSqlite(tmpDir);

        const store = await GraphStore.open(tmpDir);
        expect(store.getNode("a.ts")!.stale).toBe(true);
        store.close();
    });

    it("handles nodes without optional fields", async () => {
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
        await fs.writeFile(path.join(tmpDir, "graph.json"), JSON.stringify(json), "utf8");
        const result = await migrateJsonToSqlite(tmpDir);
        expect(result.success).toBe(true);

        const store = await GraphStore.open(tmpDir);
        const node = store.getNode("a.ts");
        expect(node).toBeDefined();
        expect(node!.exports).toEqual([]);
        expect(node!.tags).toEqual([]);
        expect(node!.stale).toBe(false);
        store.close();
    });
});
